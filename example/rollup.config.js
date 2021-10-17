import copy from "@barusu/rollup-plugin-copy"
import commonjs from "@rollup/plugin-commonjs"
import { nodeResolve } from "@rollup/plugin-node-resolve"
import rollupTypescript from "@rollup/plugin-typescript"
import fs from "fs"
import serve from "rollup-plugin-serve"

export default {
  input: "src/index.ts",
  output: {
    dir: "public/js",
    sourcemap: true,
    format: "iife",
  },
  plugins: [
    nodeResolve({ preferBuiltins: false, browser: true }),
    commonjs(),
    rollupTypescript(),
    copy({
      targets: [
        {
          src: "../node_modules/@ryohey/wavelet/dist/processor.*",
          dest: "public/js",
        },
      ],
    }),
    serve({
      contentBase: "public",
      open: true,
      https: {
        key: fs.readFileSync("./cert/localhost+1-key.pem"),
        cert: fs.readFileSync("./cert/localhost+1.pem"),
      },
    }),
  ],
}

function copyWorker(src, dst) {
  // https://lihautan.com/12-line-rollup-plugin/
  return {
    name: "copy-worker",
    load() {
      this.addWatchFile(src)
    },
    generateBundle() {
      fs.copyFileSync(src, dst)
    },
  }
}
