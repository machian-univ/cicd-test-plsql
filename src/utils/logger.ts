import chalk from 'chalk';

let verboseMode = false;

export const logger = {
  setVerbose(v: boolean) {
    verboseMode = v;
  },

  info:    (msg: string) => console.log(chalk.cyan('[i]') + '  ' + msg),
  success: (msg: string) => console.log(chalk.green('[ok]') + '  ' + msg),
  warn:    (msg: string) => console.log(chalk.yellow('[warn]') + '  ' + msg),
  error:   (msg: string) => console.log(chalk.red('[err]') + '  ' + msg),
  step:    (msg: string) => console.log(chalk.blue('[>]') + '  ' + msg),
  blank:   ()            => console.log(),

  verbose(msg: string) {
    if (verboseMode) console.log(chalk.gray('[verbose] ' + msg));
  },

  header(msg: string) {
    console.log();
    console.log(chalk.bold('='.repeat(50)));
    console.log(chalk.bold('  ' + msg));
    console.log(chalk.bold('='.repeat(50)));
    console.log();
  },

  section(msg: string) {
    console.log();
    console.log(chalk.bold(msg));
    console.log(chalk.gray('-'.repeat(40)));
  },
};
