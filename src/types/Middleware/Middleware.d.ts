type Middleware = ((request: AppRequest, next: MiddlewareNext) => void) | string;