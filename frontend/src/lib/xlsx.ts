/**
 * Minimal XLSX writer — builds a multi-sheet workbook in the browser with no
 * dependencies. An .xlsx file is a ZIP of XML parts; we store every part
 * uncompressed (method 0) so no deflate implementation is needed.
 *
 * Values are written as numbers when they are finite numbers, otherwise as
 * inline strings. That is all this export needs — no styling or formulas.
 */

export type CellValue = string | number | null | undefined;

export interface Sheet {
    /** Tab name. Excel limits this to 31 chars and forbids : \ / ? * [ ] */
    name: string;
    /** First row is treated as the header row by convention, not by format. */
    rows: CellValue[][];
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
};

const escapeXml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        // Control characters are illegal in XML 1.0 and make Excel reject the file.
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

/** 1 -> A, 27 -> AA */
const columnLetter = (index: number) => {
    let n = index + 1;
    let out = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        n = Math.floor((n - rem) / 26);
    }
    return out;
};

/** Excel rejects : \ / ? * [ ] in tab names and caps them at 31 chars. */
const safeSheetName = (name: string, fallback: string) => {
    const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
    return cleaned || fallback;
};

const sheetXml = (rows: CellValue[][]) => {
    const body = rows
        .map((row, rowIndex) => {
            const r = rowIndex + 1;
            const cells = row
                .map((value, colIndex) => {
                    if (value === null || value === undefined || value === "") return "";
                    const ref = `${columnLetter(colIndex)}${r}`;
                    if (typeof value === "number" && Number.isFinite(value)) {
                        return `<c r="${ref}"><v>${value}</v></c>`;
                    }
                    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
                })
                .join("");
            return `<row r="${r}">${cells}</row>`;
        })
        .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
};

interface ZipEntry {
    path: string;
    // Explicitly backed by ArrayBuffer (not SharedArrayBuffer) so these stay
    // assignable to BlobPart under TS 5.7+ generic typed arrays.
    data: Uint8Array<ArrayBuffer>;
}

const buildZip = (entries: ZipEntry[]) => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const central: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;

    const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
    const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

    entries.forEach((entry) => {
        const nameBytes = new TextEncoder().encode(entry.path);
        const crc = crc32(entry.data);
        const size = entry.data.length;

        const localHeader = new Uint8Array([
            0x50, 0x4b, 0x03, 0x04, // local file header signature
            ...u16(20), // version needed
            ...u16(0), // flags
            ...u16(0), // method: stored
            ...u16(0), ...u16(0), // mod time / date
            ...u32(crc),
            ...u32(size), // compressed size
            ...u32(size), // uncompressed size
            ...u16(nameBytes.length),
            ...u16(0), // extra field length
        ]);

        chunks.push(localHeader, nameBytes, entry.data);

        central.push(
            new Uint8Array([
                0x50, 0x4b, 0x01, 0x02, // central directory header signature
                ...u16(20), // version made by
                ...u16(20), // version needed
                ...u16(0), // flags
                ...u16(0), // method: stored
                ...u16(0), ...u16(0), // mod time / date
                ...u32(crc),
                ...u32(size),
                ...u32(size),
                ...u16(nameBytes.length),
                ...u16(0), // extra field length
                ...u16(0), // comment length
                ...u16(0), // disk number
                ...u16(0), // internal attrs
                ...u32(0), // external attrs
                ...u32(offset),
                ...nameBytes,
            ])
        );

        offset += localHeader.length + nameBytes.length + size;
    });

    const centralSize = central.reduce((acc, part) => acc + part.length, 0);
    const end = new Uint8Array([
        0x50, 0x4b, 0x05, 0x06, // end of central directory signature
        ...u16(0), ...u16(0), // disk numbers
        ...u16(entries.length),
        ...u16(entries.length),
        ...u32(centralSize),
        ...u32(offset),
        ...u16(0), // comment length
    ]);

    return new Blob([...chunks, ...central, end], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
};

/** Builds a workbook blob with one tab per sheet. */
export const buildXlsx = (sheets: Sheet[]): Blob => {
    const encoder = new TextEncoder();
    const named = sheets.map((sheet, i) => ({
        ...sheet,
        name: safeSheetName(sheet.name, `Sheet${i + 1}`),
    }));

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named
        .map(
            (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join("")}</Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
        .map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
        .map(
            (_, i) =>
                `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join("")}</Relationships>`;

    return buildZip([
        { path: "[Content_Types].xml", data: encoder.encode(contentTypes) },
        { path: "_rels/.rels", data: encoder.encode(rootRels) },
        { path: "xl/workbook.xml", data: encoder.encode(workbook) },
        { path: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
        ...named.map((sheet, i) => ({
            path: `xl/worksheets/sheet${i + 1}.xml`,
            data: encoder.encode(sheetXml(sheet.rows)),
        })),
    ]);
};

/** Builds the workbook and triggers a browser download. */
export const downloadXlsx = (fileName: string, sheets: Sheet[]) => {
    const url = URL.createObjectURL(buildXlsx(sheets));
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
