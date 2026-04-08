import { run } from "./local/local.js";

run(process.argv.slice(2)).catch((err) => {
  console.error(`error: ${err}`);
  process.exit(1);
});
