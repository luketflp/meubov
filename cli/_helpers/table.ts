// Render an array of objects as a clean bordered table, dropping the noisy
// numeric index column that `console.table` adds. From: https://stackoverflow.com/a/67859384
import { Console } from "node:console";
import { Transform } from "node:stream";

export function printTable(input: Record<string, unknown>[]) {
  const ts = new Transform({
    transform(chunk, _enc, cb) {
      cb(null, chunk);
    },
  });
  const logger = new Console({ stdout: ts });
  logger.table(input);
  const table = (ts.read() || "").toString();
  let result = "";
  for (const row of table.split(/[\r\n]+/)) {
    let r = row.replace(/[^┬]*┬/, "┌");
    r = r.replace(/^├─*┼/, "├");
    r = r.replace(/│[^│]*/, "");
    r = r.replace(/^└─*┴/, "└");
    r = r.replace(/'/g, " ");
    result += `${r}\n`;
  }
  console.log(result);
}
