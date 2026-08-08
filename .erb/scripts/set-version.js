// Sets the version in both package.json files. They must stay in sync: the root one is what
// humans read, but electron-builder reads release/app/package.json (build.directories.app)
// and names the published GitHub Release after it.
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Anchored to a top-level (2-space indented) key so we don't clobber the nested "version"
// fields under devEngines.
const VERSION_FIELD = /^ {2}"version": "[^"]*"/m;

function fail(message) {
  console.log(chalk.whiteBright.bgRed.bold(message));
  process.exit(2);
}

const version = process.argv[2];
if (!version || !SEMVER.test(version)) {
  fail(`Usage: npm run version:set <semver>  (got "${version ?? ''}")`);
}

const manifests = [
  path.join(__dirname, '../../package.json'),
  path.join(__dirname, '../../release/app/package.json'),
];

manifests.forEach((manifest) => {
  const relative = path.relative(process.cwd(), manifest);
  const source = fs.readFileSync(manifest, 'utf8');

  if (!VERSION_FIELD.test(source)) {
    fail(`No top-level "version" field found in ${relative}`);
  }

  const previous = JSON.parse(source).version;
  // Rewrite in place rather than re-serializing the parsed object, so the rest of the file's
  // formatting is untouched and the diff is one line.
  fs.writeFileSync(
    manifest,
    source.replace(VERSION_FIELD, `  "version": "${version}"`),
  );
  console.log(`${relative}: ${previous} -> ${version}`);
});

console.log(
  `\nNext: commit, push, then "git tag -a v${version} -m v${version}"`,
);
