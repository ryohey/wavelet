import commonjs from "@rollup/plugin-commonjs"
import { nodeResolve } from "@rollup/plugin-node-resolve"
import rollupTypescript from "@rollup/plugin-typescript"
import fs from "fs"
import serve from "rollup-plugin-serve"

const output = {
  dir: "public/js/",
  format: "iife",
  sourcemap: true,
}

const plugins = [
  nodeResolve({ preferBuiltins: false, browser: true }),
  commonjs(),
  rollupTypescript(),
]

export default [
  {
    input: "src/index.ts",
    output,
    plugins: [
      ...plugins,
      serve({
        contentBase: "public",
        open: true,
        https: {
          key: fs.readFileSync("./cert/localhost+1-key.pem"),
          cert: fs.readFileSync("./cert/localhost+1.pem"),
        },
      }),
    ],
  },
  {
    input: "src/synth-processor.ts",
    output,
    plugins,
  },
]
