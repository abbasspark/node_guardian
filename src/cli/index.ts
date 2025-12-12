import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Guardian } from '../index';
import { DashboardServer } from '../dashboard/server';
import { EventType } from '../collector/eventStore';

const program = new Command();

program
  .name('guardian')
  .description('Node.js async deadlock, memory leak, and event loop monitoring')
  .version('0.1.0');

program
  .command('start')
  .description('Start Guardian monitoring')
  .option('-d, --dashboard', 'Open dashboard automatically', false)
  .option('-p, --port <port>', 'Dashboard port', '4600')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🛡️  Guardian - Node.js Monitoring\n'));

    const guardian = Guardian.getInstance();
    guardian.start();

    const spinner = ora('Starting monitors...').start();
    
    // Give monitors time to initialize
    setTimeout(() => {
      spinner.succeed('Monitors started');
      
      const status = guardian.getStatus();
      console.log(chalk.green('✓ Event Loop Monitor'));
      console.log(chalk.green('✓ Promise Tracker'));
      console.log(chalk.green('✓ Memory Monitor'));
      console.log(chalk.green('✓ Unawaited Promise Detector'));
      console.log();
      console.log(chalk.dim(`Process: ${status.pid}`));
      console.log(chalk.dim(`Node: ${status.nodeVersion}`));
      console.log();

      if (options.dashboard) {
        startDashboard(guardian, parseInt(options.port));
      } else {
        console.log(chalk.yellow('💡 Run "guardian dashboard" to view real-time UI'));
      }

      // Show events in console
      guardian.getEventStore().on('event', (event) => {
        if (event.severity === 'critical' || event.severity === 'error') {
          console.log();
          console.log(getSeverityColor(event.severity)(`[${event.severity.toUpperCase()}] ${event.type}`));
          if (event.file) {
            console.log(chalk.dim(`  ${event.file}:${event.line}`));
          }
          if (event.suggestion) {
            console.log(chalk.yellow(`  ${event.suggestion.split('\\n')[0]}`));
          }
          console.log();
        }
      });

    }, 1000);

    // Keep process alive
    process.stdin.resume();
  });

program
  .command('dashboard')
  .description('Open Guardian dashboard')
  .option('-p, --port <port>', 'Port to use', '4600')
  .option('-h, --host <host>', 'Host to bind to', 'localhost')
  .action(async (options) => {
    const guardian = Guardian.getInstance();
    guardian.start();

    await startDashboard(guardian, parseInt(options.port), options.host);

    // Keep process alive
    process.stdin.resume();
  });

program
  .command('status')
  .description('Show current monitoring status')
  .action(() => {
    const guardian = Guardian.getInstance();
    guardian.start();

    setTimeout(() => {
      const status = guardian.getStatus();

      console.log(chalk.blue.bold('\n📊 Guardian Status\n'));
      console.log(chalk.white('Running:', status.isRunning ? chalk.green('Yes') : chalk.red('No')));
      console.log(chalk.white('Uptime:', formatUptime(status.uptime)));
      console.log();

      console.log(chalk.yellow.bold('Event Loop:'));
      const el = status.monitors.eventLoop;
      if (el) {
        console.log(`  Mean: ${el.mean?.toFixed(2)}ms`);
        console.log(`  P95: ${el.percentile95?.toFixed(2)}ms`);
        console.log(`  Stalls: ${el.stallCount}`);
      }
      console.log();

      console.log(chalk.yellow.bold('Promises:'));
      const p = status.monitors.promises;
      console.log(`  Pending: ${p.pending}`);
      console.log(`  Suspicious: ${p.suspiciousCount}`);
      console.log(`  Deadlocks: ${p.deadlockCount}`);
      console.log();

      console.log(chalk.yellow.bold('Memory:'));
      const m = status.monitors.memory;
      console.log(`  Heap: ${m.current.heapUsed}MB`);
      console.log(`  Growth: ${m.growth > 0 ? '+' : ''}${m.growth}MB`);
      console.log(`  Leaks: ${m.leakDetectedCount}`);
      console.log();

      console.log(chalk.yellow.bold('Events:'));
      console.log(`  Total: ${status.events.total}`);
      console.log(`  By severity:`, status.events.bySeverity);
      console.log();

      guardian.stop();
      process.exit(0);
    }, 1000);
  });

program
  .command('events')
  .description('Show recent events')
  .option('-t, --type <type>', 'Filter by event type')
  .option('-s, --severity <severity>', 'Filter by severity')
  .option('-n, --number <number>', 'Number of events to show', '20')
  .action((options) => {
    const guardian = Guardian.getInstance();
    guardian.start();

    setTimeout(() => {
      const events = guardian.getEvents({
        type: options.type ? EventType[options.type as keyof typeof EventType] : undefined,
        severity: options.severity,
      }).slice(-parseInt(options.number));

      console.log(chalk.blue.bold(`\n📋 Recent Events (${events.length})\n`));

      events.forEach(event => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        const color = getSeverityColor(event.severity);
        
        console.log(color(`[${event.severity.toUpperCase()}] ${event.type} - ${time}`));
        if (event.file) {
          console.log(chalk.dim(`  ${event.file}:${event.line}`));
        }
        console.log(chalk.white(`  ${JSON.stringify(event.data)}`));
        console.log();
      });

      guardian.stop();
      process.exit(0);
    }, 1000);
  });

program
  .command('deadlocks')
  .description('Check for promise deadlocks')
  .action(() => {
    const guardian = Guardian.getInstance();
    guardian.start();

    setTimeout(() => {
      const promises = guardian.getPendingPromises();

      console.log(chalk.blue.bold(`\n🔍 Pending Promises (${promises.length})\n`));

      if (promises.length === 0) {
        console.log(chalk.green('✓ No deadlocks detected'));
      } else {
        promises.forEach((p, i) => {
          const age = Math.round((Date.now() - p.createdAt) / 1000);
          const color = age > 30 ? chalk.red : age > 10 ? chalk.yellow : chalk.white;
          
          console.log(color(`${i + 1}. Pending for ${age}s`));
          if (p.file) {
            console.log(chalk.dim(`   ${p.file}:${p.line}`));
          }
          console.log();
        });
      }

      guardian.stop();
      process.exit(0);
    }, 5000); // Wait longer to detect deadlocks
  });

program
  .command('doctor')
  .description('Run health check on your Node.js app')
  .action(() => {
    console.log(chalk.blue.bold('\n🏥 Guardian Doctor\n'));
    
    const guardian = Guardian.getInstance();
    guardian.start();

    const spinner = ora('Analyzing your application...').start();

    setTimeout(() => {
      spinner.succeed('Analysis complete');

      const status = guardian.getStatus();
      const issues: string[] = [];
      const suggestions: string[] = [];

      // Check event loop
      const el = status.monitors.eventLoop;
      if (el && el.mean && el.mean > 50) {
        issues.push(chalk.red('✗ Event loop is slow (avg: ' + el.mean.toFixed(1) + 'ms)'));
        suggestions.push('  → Look for blocking sync operations');
      } else {
        console.log(chalk.green('✓ Event loop is healthy'));
      }

      // Check promises
      const p = status.monitors.promises;
      if (p.deadlockCount > 0) {
        issues.push(chalk.red(`✗ ${p.deadlockCount} deadlocks detected`));
        suggestions.push('  → Run "guardian deadlocks" for details');
      } else if (p.suspiciousCount > 5) {
        issues.push(chalk.yellow(`⚠ ${p.suspiciousCount} suspicious promises`));
        suggestions.push('  → Some promises are pending too long');
      } else {
        console.log(chalk.green('✓ Promises look good'));
      }

      // Check memory
      const m = status.monitors.memory;
      if (m.leakDetectedCount > 0) {
        issues.push(chalk.red(`✗ ${m.leakDetectedCount} memory leaks detected`));
        suggestions.push('  → Check event listeners, timers, caches');
      } else if (m.growth > 50) {
        issues.push(chalk.yellow(`⚠ High memory growth: +${m.growth}MB`));
        suggestions.push('  → Monitor for potential leaks');
      } else {
        console.log(chalk.green('✓ Memory usage is stable'));
      }

      // Check unawaited
      const u = status.monitors.unawaitedPromises;
      if (u.suspicious > 5) {
        issues.push(chalk.yellow(`⚠ ${u.suspicious} unawaited promises`));
        suggestions.push('  → Add await or .catch() handlers');
      } else {
        console.log(chalk.green('✓ Promises are properly handled'));
      }

      console.log();

      if (issues.length > 0) {
        console.log(chalk.red.bold('Issues Found:'));
        issues.forEach(issue => console.log(issue));
        console.log();
        console.log(chalk.yellow.bold('Suggestions:'));
        suggestions.forEach(s => console.log(s));
      } else {
        console.log(chalk.green.bold('✓ Your application looks healthy!'));
      }

      console.log();

      guardian.stop();
      process.exit(0);
    }, 10000); // Run for 10 seconds
  });

async function startDashboard(guardian: Guardian, port: number, host: string = 'localhost') {
  const dashboard = new DashboardServer(guardian, { port, host });
  await dashboard.start();
  
  console.log();
  console.log(chalk.green.bold('✓ Dashboard is running'));
  console.log();
  console.log(chalk.cyan('  Open in browser:'));
  console.log(chalk.cyan.bold(`  http://${host}:${port}`));
  console.log();
  console.log(chalk.dim('  Press Ctrl+C to stop'));
  console.log();
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical':
      return chalk.red.bold;
    case 'error':
      return chalk.red;
    case 'warning':
      return chalk.yellow;
    default:
      return chalk.blue;
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

program.parse();
