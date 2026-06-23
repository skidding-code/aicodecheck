import type { NextFunction, Request, Response } from "express";

/** Wrap an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function newId(): string {
  // 32-char hex, like the Python API's uuid4().hex
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0");
  }
  return s.slice(0, 32);
}
