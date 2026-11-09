import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface ICurrentUser {
  userId: string;
  tenantId: string;
  tenantType: string;
  email: string;
  role: string;
  /** `session_id` of the token: identifies the session of a super administrator (see auth/admin-session.ts) */
  sessionId?: string;
  cognitoSub?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof ICurrentUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as ICurrentUser;

    return data ? user?.[data] : user;
  },
);
