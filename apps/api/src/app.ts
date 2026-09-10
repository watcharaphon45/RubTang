import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthRequest, AuthService, cookieOptions, SessionGuard, sessionCookie, tokenHash } from './auth';
import { CatalogService } from './catalog';
import { Database } from './database';
import { InventoryService } from './inventory';

@Controller()
class AppController {
  constructor(@Inject(Database) private readonly db: Database, @Inject(AuthService) private readonly auth: AuthService, @Inject(CatalogService) private readonly catalog: CatalogService, @Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get('health') health() { return { status: 'ok', service: 'rubtang-api' }; }
  @Post('auth/register') register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) { return this.auth.register(body, res); }
  @Post('auth/login') @HttpCode(200) login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) { return this.auth.login(body, res); }

  @Get('auth/me') @UseGuards(SessionGuard)
  async me(@Req() req: AuthRequest) {
    const p = req.principal;
    const [user, tenant, branches] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: p.userId }, select: { id: true, displayName: true, email: true } }),
      this.db.tenant.findUniqueOrThrow({ where: { id: p.tenantId }, select: { id: true, name: true } }),
      this.db.branch.findMany({ where: { tenantId: p.tenantId, ...(p.role === 'OWNER' ? {} : { id: { in: p.branchIds } }) }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { user, tenant, branches, role: p.role };
  }

  @Post('auth/logout') @HttpCode(200) @UseGuards(SessionGuard)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.session.deleteMany({ where: { tokenHash: tokenHash(req.cookies[sessionCookie]) } });
    res.clearCookie(sessionCookie, cookieOptions());
    return { ok: true };
  }

  @Get('products') @UseGuards(SessionGuard)
  list(@Req() req: AuthRequest, @Query('branchId') branchId: unknown, @Query('search') search: unknown) { return this.catalog.list(req.principal, branchId, search); }

  @Post('products') @UseGuards(SessionGuard)
  create(@Req() req: AuthRequest, @Body() body: unknown) { return this.catalog.create(req.principal, body); }

  @Post('products/:id') @HttpCode(200) @UseGuards(SessionGuard)
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.catalog.update(req.principal, id, body); }

  @Get('inventory/movements') @UseGuards(SessionGuard)
  history(@Req() req: AuthRequest, @Query('branchId') branch: unknown, @Query('productId') product: unknown, @Query('cursor') cursor: unknown) { return this.inventory.history(req.principal, branch, product, cursor); }

  @Post('inventory/movements') @UseGuards(SessionGuard)
  receive(@Req() req: AuthRequest, @Body() body: unknown) { return this.inventory.record(req.principal, body); }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [AppController],
  providers: [Database, AuthService, SessionGuard, CatalogService, InventoryService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
