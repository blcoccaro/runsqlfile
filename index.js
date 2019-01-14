console.log("Starting service...");
var pjson = require('./package.json');
var sql = require("mssql");
var fs = require('fs');
var moment = require('moment');
const { promisify } = require('util');
const { replace } = require('strman');
const { contains } = require('strman');
const readdir = promisify(fs.readdir);

console.log("Reading configuration.");

var config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
console.log(`path for connectionstring: ${config.paths.connectionstring}`);
var configDB = JSON.parse(fs.readFileSync(config.paths.connectionstring, 'utf8'));
var databases = JSON.parse(fs.readFileSync(config.paths.databases, 'utf8'));

(async function () {
    try {
        for (var x=0; x<databases.names.length; x++) {

            configDB.database = databases.names[x];
            console.log(`connecting to ${configDB.database}`);
        
            let pool = await sql.connect(configDB);
            console.log(`reading files in ${config.paths.sqlFiles}`);
    
            let files = fs.readdirSync(config.paths.sqlFiles);
//            console.log(files);
            for (var i=0; i<files.length; i++) {
                process.stdout.write(`executing ${files[i]}...`);
                //console.log(`executing ${files[i]}...`);
    
                const contentIfExist = `
                IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = '${replace(files[i], ".sql", "", false, true)}') 
                BEGIN
                    SELECT 1 AS result
                END
                ELSE
                BEGIN
                    SELECT 0 AS result
                END
                `;
                let checkResult = await pool.request().query(contentIfExist);
                let procExist = checkResult.recordset[0]["result"] == 1 || checkResult.recordset[0]["result"] == "1";
    
                let content = fs.readFileSync(`${config.paths.sqlFiles}/${files[i]}`, 'utf8');
                content = `--Generated at ${moment().format("YYYY-MM-DD HH:mm:ss")} using runsqlFile v.${pjson.version} \n ${content}`;
    
                if (contains(content, "alter procedure", false) && !procExist) {
                    //console.log(`warning: procedure doesn't but founded ALTER PROCEDURE in file. Changing now to CREATE PROCEDURE only o runtime.`);
                    content = replace(content, "alter procedure", "CREATE PROCEDURE", false, true);
                    //console.log(content);
                }
                if (contains(content, "create procedure", false) && procExist) {
                    //console.log(`warning: procedure exist but founded CREATE PROCEDURE in file. Changing now to ALTER PROCEDURE only o runtime.`);
                    content = replace(content, "create procedure", "ALTER PROCEDURE", false, true);
                    //console.log(content);
                }
                let result = await pool.request().query(content);
                process.stdout.write(` executed.`);
                process.stdout.write("\n");
//                console.log(`executed ${files[i]}.`);
            }
            console.log(`closing connection to ${configDB.database}.`);
            console.log(" ---- ");
            sql.close();
        }
        
        process.exit();
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
})()
