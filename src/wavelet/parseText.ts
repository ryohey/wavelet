class TextData {
  private lines: string[]
  line = 0

  constructor(text: string) {
    this.lines = text.split(/\r\n|\n/)
  }

  getLine() {
    return this.lines[this.line]
  }

  moveNextLine() {
    this.line++
  }

  eof() {
    return this.line === this.lines.length
  }
}

const logEnabled = false
const logger = logEnabled
  ? console
  : { log: () => {}, warn: () => {}, error: () => {} }

const parseLine = (text: TextData, currentIndentLevel: number) => {
  const result: TextNode[] = []

  while (!text.eof()) {
    const line = text.getLine()

    if (line.match(/^\s*$/) !== null) {
      // empty line
      logger.log("skip empty line")
      text.moveNextLine()
      continue
    }

    const match = line.match(/^( +)/)
    const indentLevel = match === null ? 0 : match[1].length / 4

    logger.log(
      text.line,
      line,
      currentIndentLevel,
      indentLevel,
      `"${match?.[0]}"`,
      match?.[0].length
    )

    if (indentLevel === currentIndentLevel) {
      logger.log(`continue level ${indentLevel}`)
      text.moveNextLine()
      result.push({
        value: line.replace(/^( +)/, ""),
        children: [],
      })
    } else if (indentLevel === currentIndentLevel + 1) {
      logger.log(`dig level into ${indentLevel}`)
      // dig into deeper indent level
      if (result.length === 0) {
        throw new Error("invalid nesting")
      }
      const parent = result[result.length - 1]
      parent.children.push(...parseLine(text, currentIndentLevel + 1))
    } else if (indentLevel < currentIndentLevel) {
      logger.log("break level")
      // break from this indent level
      break
    } else {
      logger.warn(`invalid indentation at line ${text.line}`)
      text.moveNextLine()
    }
  }

  return result
}

export const parseText = (text: string) => {
  const textData = new TextData(text)
  const tree = { value: "root", children: parseLine(textData, 0) }
  return treeToDict(tree)
}

const convertValue = (value: string) => {
  if (value.match(/^[0-9\.\-]+$/) !== null) {
    return parseFloat(value)
  }
  return value
}

const equalSeparatedToDict = (arr: string[]) => {
  if (arr.every((v) => v.split("=").length === 2)) {
    return Object.fromEntries(
      arr.map((v) => v.split("=")).map((sp) => [sp[0], convertValue(sp[1])])
    )
  }
  return arr
}

interface TextNode {
  value: string
  children: TextNode[]
}

const treeToDict = (node: TextNode): any => {
  if (node.children.length === 0) {
    return node.value
  }
  const children = node.children.map(treeToDict)
  if (node.value === "[Samples]") {
    return {
      Samples: children.reduce((p, c) => ({ ...p, ...c }), {}),
    }
  }
  if (node.value === "[Presets]") {
    return {
      Presets: children.reduce((p, c) => ({ ...p, ...c }), {}),
    }
  }
  if (node.value === "[Instruments]") {
    return {
      Instruments: children.reduce((p, c) => ({ ...p, ...c }), {}),
    }
  }
  if (node.value === "root") {
    return children
      .filter((c) => typeof c === "object")
      .reduce((p, c) => ({ ...p, ...c }), {})
  }
  if (node.value.startsWith("SampleName=")) {
    const sp = node.value.split("=")
    return { [sp[1]]: equalSeparatedToDict(children) }
  }
  if (node.value.startsWith("Sample=")) {
    const sp = node.value.split("=")
    return {
      [sp[0]]: sp[1],
      ...equalSeparatedToDict(children),
    }
  }
  if (node.value.startsWith("PresetName=")) {
    const sp = node.value.split("=")
    const instruments = children
      .filter(
        (obj) =>
          typeof obj === "object" && Object.keys(obj).includes("Instrument")
      )
      .map((obj) => obj["Instrument"])
      .reduce((p, c) => ({ ...p, ...c }), {})
    const globalLayer = equalSeparatedToDict(
      children.find((c) => c.value === "GlobalLayer")?.children ?? []
    )
    const equalSeparated = children.filter(
      (c) => typeof c === "string" && c.split("=").length === 2
    )
    // const nonEqualSeparated = children.filter(v => typeof v !== "string" || v.split("=").length != 2)
    return {
      [sp[1]]: {
        ...equalSeparatedToDict(equalSeparated),
        Instruments: instruments,
        GlobalLayer: globalLayer,
      },
    }
  }
  if (node.value.startsWith("Instrument=")) {
    const sp = node.value.split("=")
    return {
      Instrument: {
        [sp[1]]: equalSeparatedToDict(children),
      },
    }
  }
  if (node.value.startsWith("InstrumentName=")) {
    const sp = node.value.split("=")

    return {
      [sp[1]]: {
        Samples: children
          .filter((c) => Object.keys(c).includes("Sample"))
          .map(({ Sample, ...rest }) => ({ [Sample]: rest }))
          .reduce((p, c) => ({ ...p, ...c }), {}),
        GlobalZone: equalSeparatedToDict(
          children.find((c) => c.value === "GlobalZone")?.children ?? []
        ),
      },
    }
  }
  return {
    value: node.value,
    children,
  }
}
