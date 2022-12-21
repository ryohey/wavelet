import commonjs from "@rollup/plugin-commonjs"
import { nodeResolve } from "@rollup/plugin-node-resolve"
import rollupTypescript from "@rollup/plugin-typescript"

const output = {
  dir: "dist",
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
    output: {
      ...output,
      format: "esm",
    },
    plugins,
  },
  {
    input: "src/processor/processor.ts",
    output: {
      ...output,
      format: "iife",
    },
    plugins,
  },
  {
    input: "src/renderer/rendererWorker.ts",
    output: {
      ...output,
      format: "iife",
    },
    plugins,
  },
]
