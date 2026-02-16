#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
}

function ensureDirForFile(outputPath) {
  const directory = path.dirname(outputPath)
  fs.mkdirSync(directory, { recursive: true })
}

function usage() {
  console.log(
    'Usage: node scripts/ttf-to-typeface.mjs <input.ttf|otf> <output.typeface.json>',
  )
}

const [inputPath, outputPath] = process.argv.slice(2)

if (!inputPath || !outputPath) {
  usage()
  process.exit(1)
}

if (!fs.existsSync(inputPath)) {
  console.error(`Input font not found: ${inputPath}`)
  process.exit(1)
}

const loader = new TTFLoader()
const source = fs.readFileSync(inputPath)
const parsed = loader.parse(toArrayBuffer(source))

ensureDirForFile(outputPath)
fs.writeFileSync(outputPath, `${JSON.stringify(parsed)}\n`, 'utf8')

console.log(`Converted ${inputPath} -> ${outputPath}`)
