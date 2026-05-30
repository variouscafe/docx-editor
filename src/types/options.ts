import { LineStartSymbol } from "./lineStartSymbol";

export interface CommonOptions {
  fontSize: number;
  paragraphSpacing: number;
  fontFamily: string;
}

export interface H1Options {
  paragraphSpacing: number;
  fontSize: number;
  lineStartSymbol: LineStartSymbol;
  bold: boolean;
}

export interface H2Options {
  paragraphSpacing: number;
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
}

export interface H3Options {
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
}

export interface H4Options {
  lineStartSymbol: LineStartSymbol;
  leadingSpaces: number;
  secondLineSpacing: number;
  singleLineSpacing: number;
}

export interface DocxOptions {
  common: CommonOptions;
  h1: H1Options;
  h2: H2Options;
  h3: H3Options;
  h4: H4Options;
}

export const defaultOptions: DocxOptions = {
  common: {
    fontSize: 14,
    paragraphSpacing: 12,
    fontFamily: "Batang, 바탕체, 'Batang Che', serif",
  },
  h1: {
    paragraphSpacing: 24,
    fontSize: 24,
    lineStartSymbol: LineStartSymbol.NUMBER_DOT,
    bold: true,
  },
  h2: {
    paragraphSpacing: 16,
    lineStartSymbol: LineStartSymbol.SQUARE,
    leadingSpaces: 1,
  },
  h3: {
    lineStartSymbol: LineStartSymbol.DASH,
    leadingSpaces: 4,
  },
  h4: {
    lineStartSymbol: LineStartSymbol.BULLET,
    leadingSpaces: 4,
    secondLineSpacing: 16,
    singleLineSpacing: 16,
  },
};
