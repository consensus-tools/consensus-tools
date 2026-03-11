import { buildProgram } from "./commands.js";

const program = buildProgram();
program.parseAsync(process.argv);
