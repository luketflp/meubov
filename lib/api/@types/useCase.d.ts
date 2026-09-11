/**
 * Shape every use case implements.
 *
 * A use case is one operation of one domain: it owns the database work for
 * that operation and nothing else. Controllers translate HTTP to `run` and
 * `run`'s result back to HTTP; they hold no query logic.
 */
declare global {
  interface _UseCase<TRequest, TResponse> {
    run: (props: TRequest) => Promise<TResponse>;
  }

  interface _UseCaseSync<TRequest, TResponse> {
    run: (props: TRequest) => TResponse;
  }
}

export {};
