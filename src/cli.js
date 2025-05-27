#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const ReactParser = require('./parser');

const program = new Command();

program
  .name('react-analyzer')
  .description('Static analysis tool to detect circular state dependencies in React projects')
  .version('1.0.0');

program
  .option('-e, --entry <path>', 'Entry point file or directory', process.cwd())
  .option('-c, --config <path>', 'Configuration file path')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--graph', 'Print the complete dependency graph')
  .option('-w, --web', 'Launch web interface')
  .option('-p, --port <number>', 'Port for web server', '3000')
  .action((options) => {
    try {
      if (options.web) {
        launchWebInterface(options.port);
        return;
      }

      const config = loadConfig(options.config);
      const entryPoint = path.resolve(options.entry || config.entry || process.cwd());
      
      if (!fs.existsSync(entryPoint)) {
        console.error(chalk.red(`Entry point does not exist: ${entryPoint}`));
        process.exit(1);
      }

      console.log(chalk.blue('🔍 Analyzing React project for circular state dependencies...'));
      console.log(chalk.gray(`Entry point: ${entryPoint}`));
      
      const parser = new ReactParser();
      const graph = parser.analyzeProject(entryPoint);
      
      if (options.verbose || options.graph) {
        console.log(chalk.yellow('\n📊 Dependency Graph:'));
        graph.printGraph();
      }
      
      const cycles = graph.findCircularDependencies();
      
      if (cycles.length === 0) {
        console.log(chalk.green('\n✅ No circular state dependencies found!'));
      } else {
        console.log(chalk.red(`\n❌ Found ${cycles.length} circular dependencies:`));
        
        cycles.forEach((cycle, index) => {
          console.log(chalk.red(`\n🔄 Cycle ${index + 1}:`));
          
          cycle.forEach((node, i) => {
            const nodeInfo = graph.getNodeInfo(node);
            const isLast = i === cycle.length - 1;
            const arrow = isLast ? ' → (cycles back)' : ' → ';
            
            if (nodeInfo) {
              if (nodeInfo.type === 'component') {
                console.log(chalk.yellow(`  📦 ${node} (${nodeInfo.filePath}:${nodeInfo.lineNumber})${arrow}`));
              } else {
                const location = nodeInfo.filePath && nodeInfo.lineNumber ? ` at ${nodeInfo.filePath}:${nodeInfo.lineNumber}` : '';
                console.log(chalk.cyan(`  🔧 ${node} (${nodeInfo.stateType}${location})${arrow}`));
              }
            } else {
              console.log(chalk.gray(`  ❓ ${node}${arrow}`));
            }
          });
        });
        
        console.log(chalk.red('\n⚠️  These circular dependencies may cause:'));
        console.log(chalk.red('   • Infinite re-renders'));
        console.log(chalk.red('   • Memory leaks'));
        console.log(chalk.red('   • Performance issues'));
        console.log(chalk.red('   • Unpredictable component behavior'));
        
        process.exit(1);
      }
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

function loadConfig(configPath) {
  if (!configPath) {
    const defaultConfigPath = path.join(process.cwd(), 'react-analyzer.config.js');
    if (fs.existsSync(defaultConfigPath)) {
      configPath = defaultConfigPath;
    } else {
      return {};
    }
  }
  
  try {
    const configFullPath = path.resolve(configPath);
    if (fs.existsSync(configFullPath)) {
      delete require.cache[configFullPath];
      return require(configFullPath);
    }
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not load config file: ${error.message}`));
  }
  
  return {};
}

function launchWebInterface(port) {
  console.log(chalk.blue('🌐 Launching web interface...'));
  console.log(chalk.gray(`Starting server on port ${port}`));
  
  process.env.PORT = port;
  require('./server');
}

program.parse();