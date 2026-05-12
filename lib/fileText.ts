import pdf from "pdf-parse";

export async function fileToText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type.includes("pdf") || name.endsWith(".pdf")) {
    const result = await pdf(buffer);
    return result.text.trim();
  }

  return buffer.toString("utf-8").trim();
}
