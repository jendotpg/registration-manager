const { exec } = require('child_process');
const { PythonShell } = require('python-shell');

exports.default = async function machOUuid(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin' || context.arch !== 4) {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  const executablePath = `${appPath}/Contents/MacOS/${appName}`;
  const pythonShellOptions = process.env.PYTHON_PATH
    ? {
        pythonPath: process.env.PYTHON_PATH,
        args: [executablePath],
      }
    : {
        args: [executablePath],
      };
  const results = await PythonShell.run(
    `${__dirname}/mach-o-uuid.py`,
    pythonShellOptions,
  );
  console.log(results.join('\n'));

  await new Promise((resolve, reject) => {
    exec(`codesign --deep -s - "${appPath}"`, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};
