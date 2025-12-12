/**
 * Example NestJS Application with Guardian
 * 
 * This demonstrates:
 * 1. How to integrate Guardian
 * 2. What kinds of issues it detects
 * 3. How to use decorators
 */

import { Module, Injectable, Controller, Get } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GuardianModule, MonitorAsync, GuardianMonitored } from 'async-guardian/nestjs';

// ============================================
// EXAMPLE 1: Memory Leak (will be detected)
// ============================================

@Injectable()
export class CacheService {
  private cache = new Map<string, any>();

  // This will cause a memory leak!
  addToCache(key: string, value: any) {
    this.cache.set(key, value);
    // Never removes old entries!
  }

  getCache() {
    return this.cache;
  }
}

// ============================================
// EXAMPLE 2: Async Deadlock (will be detected)
// ============================================

@GuardianMonitored()
@Injectable()
export class OrderService {
  constructor(private paymentService: PaymentService) {}

  async createOrder(orderId: string) {
    console.log('Creating order:', orderId);
    
    // This will deadlock!
    await this.paymentService.processPayment(orderId);
    
    return { orderId, status: 'created' };
  }
}

@GuardianMonitored()
@Injectable()
export class PaymentService {
  constructor(private orderService: OrderService) {}

  async processPayment(orderId: string) {
    console.log('Processing payment for:', orderId);
    
    // Wait for order... but order is waiting for us!
    // This creates a circular wait = DEADLOCK
    await new Promise(resolve => setTimeout(resolve, 40000)); // Simulate slow payment
    
    return { paid: true };
  }
}

// ============================================
// EXAMPLE 3: Unawaited Promise (will be detected)
// ============================================

@Injectable()
export class UserService {
  
  async getUser(id: string) {
    // Oops! Not awaited
    this.logAccess(id); // ❌ Missing await!
    
    return { id, name: 'John' };
  }

  private async logAccess(userId: string) {
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('User accessed:', userId);
  }
}

// ============================================
// EXAMPLE 4: Event Loop Blocking (will be detected)
// ============================================

@Injectable()
export class ReportService {
  
  generateReport() {
    // This blocks the event loop!
    const data = [];
    for (let i = 0; i < 10000000; i++) {
      data.push(Math.random());
    }
    
    return data.reduce((a, b) => a + b, 0);
  }
}

// ============================================
// EXAMPLE 5: Monitored Method with Timeout
// ============================================

@Injectable()
export class DatabaseService {
  
  @MonitorAsync({ timeout: 5000 })
  async findUser(id: string) {
    // This will timeout after 5s
    await new Promise(resolve => setTimeout(resolve, 6000));
    return { id, name: 'Slow User' };
  }
}

// ============================================
// Controllers
// ============================================

@Controller()
export class AppController {
  constructor(
    private cacheService: CacheService,
    private orderService: OrderService,
    private userService: UserService,
    private reportService: ReportService,
    private databaseService: DatabaseService,
  ) {}

  @Get('/')
  getHello() {
    return {
      message: 'Guardian Example API',
      dashboard: 'http://localhost:4600',
      endpoints: {
        '/memory-leak': 'Trigger memory leak',
        '/deadlock': 'Trigger async deadlock',
        '/unawaited': 'Trigger unawaited promise',
        '/blocking': 'Trigger event loop block',
        '/timeout': 'Trigger timeout',
      }
    };
  }

  @Get('/memory-leak')
  async triggerMemoryLeak() {
    // This will grow the cache infinitely
    for (let i = 0; i < 10000; i++) {
      this.cacheService.addToCache(`key-${i}`, {
        data: new Array(1000).fill('x'),
        timestamp: Date.now(),
      });
    }
    
    return {
      message: 'Added 10,000 items to cache',
      cacheSize: this.cacheService.getCache().size,
      warning: 'Check Guardian dashboard - memory leak detected!'
    };
  }

  @Get('/deadlock')
  async triggerDeadlock() {
    // This will create a circular wait
    try {
      await this.orderService.createOrder('order-123');
      return { message: 'Order created' };
    } catch (error: any) {
      return {
        message: 'Deadlock occurred',
        error: error.message,
        warning: 'Check Guardian dashboard - deadlock detected!'
      };
    }
  }

  @Get('/unawaited')
  async triggerUnawaited() {
    const user = await this.userService.getUser('user-123');
    
    return {
      message: 'User fetched',
      user,
      warning: 'Check Guardian dashboard - unawaited promise detected!'
    };
  }

  @Get('/blocking')
  triggerBlocking() {
    const result = this.reportService.generateReport();
    
    return {
      message: 'Report generated',
      result: result.toFixed(2),
      warning: 'Check Guardian dashboard - event loop blocked!'
    };
  }

  @Get('/timeout')
  async triggerTimeout() {
    try {
      const user = await this.databaseService.findUser('user-456');
      return { user };
    } catch (error: any) {
      return {
        message: 'Timeout occurred',
        error: error.message,
        warning: 'Timeout was enforced by @MonitorAsync decorator'
      };
    }
  }
}

// ============================================
// App Module
// ============================================

@Module({
  imports: [
    GuardianModule.forRoot({
      dashboard: {
        enabled: true,
        port: 4600,
      },
      monitoring: {
        eventLoop: true,
        promises: true,
        memory: true,
        unawaitedPromises: true,
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    CacheService,
    OrderService,
    PaymentService,
    UserService,
    ReportService,
    DatabaseService,
  ],
})
export class AppModule {}

// ============================================
// Bootstrap
// ============================================

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  await app.listen(3000);
  
  console.log('\n🚀 Example app running!');
  console.log('📍 API: http://localhost:3000');
  console.log('📊 Guardian Dashboard: http://localhost:4600');
  console.log('\nTry these endpoints:');
  console.log('  GET /memory-leak  - Trigger memory leak');
  console.log('  GET /deadlock     - Trigger async deadlock');
  console.log('  GET /unawaited    - Trigger unawaited promise');
  console.log('  GET /blocking     - Trigger event loop block');
  console.log('  GET /timeout      - Trigger timeout');
  console.log('\n🛡️  Watch the Guardian dashboard for real-time detection!\n');
}

bootstrap();
