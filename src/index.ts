#!/usr/bin/env node

import Axios from "axios";
import CsvParser from "csv-parse";
import { parse as parseDate } from "date-fns";

interface Record {
  type: string;
  saaNotamId: string;
  startTimeZulu: string | null;
  startTimeLocal: string | null;
  endTimeZulu: string | null;
  endTimeLocal: string | null;
  centerId: string;
  state: string;
  minAlt: string;
  maxAlt: string;
  group: string;
}

export async function* createSuaIterable(): AsyncGenerator<Record> {
  const response = await Axios({
    method: "GET",
    url: `https://sua.faa.gov/sua/download.app?colHead=%3Cbr%3E%3Cbr%3E|Type%3Cbr%3E%3Cbr%3E|Zoom%3Cbr%3E%3Cbr%3E|SAA%20/%20NOTAM%20ID%3Cbr%3E%3Cbr%3E|Start%20Time%3Cbr%3E%3Cbr%3E|End%20Time%3Cbr%3E%3Cbr%3E|Center%20ID%3Cbr%3E%3Cbr%3E|State%3Cbr%3E%3Cbr%3E|Min%20Alt%3Cbr%3E(100s%20ft)|Max%20Alt%3Cbr%3E(100s%20ft)|Group%3Cbr%3E%3Cbr%3E&`,
    responseType: "stream",
  });

  const records = response.data.pipe(
    CsvParser({
      bom: true,
      quote: false,
      ltrim: true,
      rtrim: true,
      delimiter: ",",
      ignore_last_delimiters: true,
      columns: true,
    })
  );

  for await (const rawRecord of records) {
    const record: Record = parseRecord(rawRecord);
    yield record;
  }
}

function trimValue(value: string) {
  return value.replace(/^=\"|\"$|,$/g, "");
}

function parseRecord(rawRecord: any): Record {
  const startTimeZulu = rawRecord["Start Time"]
    ? parseCsvDate(rawRecord["Start Time"])
    : null;
  const endTimeZulu = rawRecord["End Time"]
    ? parseCsvDate(rawRecord["End Time"])
    : null;

  return {
    type: trimValue(rawRecord["Type"]),
    saaNotamId: trimValue(rawRecord["SAA / NOTAM ID"]),
    startTimeZulu: startTimeZulu?.toISOString() ?? null,
    startTimeLocal: startTimeZulu?.toLocaleString() ?? null,
    endTimeZulu: endTimeZulu?.toISOString() ?? null,
    endTimeLocal: endTimeZulu?.toLocaleString() ?? null,
    centerId: trimValue(rawRecord["Center ID"]),
    state: trimValue(rawRecord["State"]),
    minAlt: trimValue(rawRecord["Min Alt(100s ft)"]),
    maxAlt: trimValue(rawRecord["Max Alt(100s ft)"]),
    group: trimValue(rawRecord["Group"]),
  };
}

function parseCsvDate(value: string) {
  const dateFormat = "MM/dd/yyyy HH:mm";
  const parsedDate = parseDate(trimValue(value), dateFormat, new Date(0));
  return new Date(
    parsedDate.getTime() - parsedDate.getTimezoneOffset() * 60 * 1000
  );
}

async function printSuas(match?: (record: Record) => boolean) {
  for await (const record of createSuaIterable()) {
    if (match == null || match(record)) {
      console.log(JSON.stringify(record));
    }
  }
}

if (require.main === module) {
  const find = process.argv[2];
  printSuas(
    (find &&
      ((record) => {
        return record.saaNotamId.includes(find);
      })) ||
      undefined
  );
}
