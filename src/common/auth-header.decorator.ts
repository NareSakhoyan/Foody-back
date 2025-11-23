import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Extract Authorization header once to avoid repeating it in controllers.
export const AuthHeader = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['authorization'] as string | undefined;
  },
);
