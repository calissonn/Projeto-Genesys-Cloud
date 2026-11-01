/**
 * Exportação de relatórios: CSV, Excel (.xlsx via ExcelJS) e PDF (jsPDF + AutoTable).
 * As bibliotecas pesadas são carregadas sob demanda (import dinâmico).
 */

export interface ReportTable {
  columns: string[];
  rows: (string | number)[][];
  /** Índices das colunas numéricas (alinhadas à direita). */
  numeric?: number[];
}

export interface ReportSection {
  title: string;
  text?: string[];
  chart?: { labels: string[]; values: number[]; unit: '%' | 'n'; title?: string };
  table?: ReportTable;
}

export interface ReportDoc {
  title: string;
  scope: string;
  period: string;
  generatedAt: string;
  simulated: boolean;
  kpis: { label: string; value: string; note?: string }[];
  sections: ReportSection[];
  conclusions: string[];
  recommendations: string[];
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** CSV com BOM e ponto e vírgula — abre corretamente no Excel em português. */
export function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  triggerDownload(new Blob(['﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName);
}

const SIM_NOTE = 'ATENÇÃO: relatório gerado com DADOS SIMULADOS (protótipo). Não há integração ativa com a Genesys Cloud.';

export async function exportExcel(doc: ReportDoc) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gazin URA Intelligence';
  wb.created = new Date();
  const sum = wb.addWorksheet('Resumo');
  sum.columns = [{ width: 46 }, { width: 28 }, { width: 50 }];
  sum.addRow([doc.title]).font = { bold: true, size: 14, color: { argb: 'FF1836AD' } };
  sum.addRow([`Escopo: ${doc.scope}`]);
  sum.addRow([`Período: ${doc.period}`]);
  sum.addRow([`Gerado em: ${doc.generatedAt}`]);
  if (doc.simulated) sum.addRow([SIM_NOTE]).font = { bold: true, color: { argb: 'FFB45309' } };
  sum.addRow([]);
  const h = sum.addRow(['Indicador', 'Valor', 'Observação']);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D55F0' } }; });
  doc.kpis.forEach((k) => sum.addRow([k.label, k.value, k.note ?? '']));
  const block = (title: string, items: string[]) => {
    if (!items.length) return;
    sum.addRow([]);
    sum.addRow([title]).font = { bold: true };
    items.forEach((t) => { const r = sum.addRow([`• ${t}`]); sum.mergeCells(r.number, 1, r.number, 3); r.alignment = { wrapText: true, vertical: 'top' }; });
  };
  block('Conclusões', doc.conclusions);
  block('Recomendações', doc.recommendations);

  doc.sections.forEach((s, i) => {
    if (!s.table) return;
    const name = `${i + 1}. ${s.title}`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    const ws = wb.addWorksheet(name);
    ws.addRow([s.title]).font = { bold: true, size: 12 };
    (s.text ?? []).forEach((t) => ws.addRow([t]));
    ws.addRow([]);
    const hr = ws.addRow(s.table.columns);
    hr.font = { bold: true };
    hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEFC' } }; });
    s.table.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((col, ci) => { col.width = Math.min(48, Math.max(12, ...[s.table!.columns[ci], ...s.table!.rows.map((r) => r[ci])].map((v) => String(v ?? '').length + 2))); });
    if (doc.simulated) { ws.addRow([]); ws.addRow(['Dados simulados']).font = { italic: true, color: { argb: 'FFB45309' } }; }
  });
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${slug(doc.title)}.xlsx`);
}

/** jsPDF com fontes padrão usa WinAnsi: troca símbolos fora desse conjunto. */
const pdfText = (s: string) => s.replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/✓/g, 'OK').replace(/[^\u0000-ÿ—–•…“”‘’]/g, '');

export async function exportPdf(doc: ReportDoc) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 14;
  let y = M;
  const ensure = (h: number) => { if (y + h > H - 16) { pdf.addPage(); y = M; } };
  const para = (t: string, size = 9.5, color: [number, number, number] = [40, 40, 40]) => {
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(pdfText(t), W - 2 * M);
    ensure(lines.length * size * 0.42 + 2);
    pdf.text(lines, M, y);
    y += lines.length * size * 0.42 + 2;
  };

  pdf.setFillColor(15, 31, 82);
  pdf.rect(0, 0, W, 24, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(15);
  pdf.text(pdfText(doc.title), M, 11);
  pdf.setFontSize(9);
  pdf.text(pdfText(`Gazin URA Intelligence · ${doc.scope} · ${doc.period}`), M, 18);
  y = 31;
  if (doc.simulated) para(SIM_NOTE, 9, [180, 83, 9]);
  para(`Gerado em ${doc.generatedAt}`, 8, [110, 110, 110]);

  autoTable(pdf, {
    startY: y, head: [['Indicador', 'Valor', 'Observação']], body: doc.kpis.map((k) => [pdfText(k.label), pdfText(k.value), pdfText(k.note ?? '')]),
    styles: { fontSize: 8.5 }, headStyles: { fillColor: [29, 85, 240] }, margin: { left: M, right: M },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const heading = (t: string) => { ensure(12); pdf.setFontSize(12); pdf.setTextColor(24, 54, 173); pdf.text(pdfText(t), M, y); y += 6; };
  if (doc.conclusions.length) { heading('Conclusões'); doc.conclusions.forEach((c) => para(`• ${c}`)); y += 2; }
  if (doc.recommendations.length) { heading('Recomendações'); doc.recommendations.forEach((c) => para(`• ${c}`)); y += 2; }

  for (const s of doc.sections) {
    // Mantém o título junto do conteúdo (evita título sozinho no fim da página).
    ensure(s.chart && s.chart.values.length ? Math.min(12, s.chart.values.length) * 6 + 16 : 28);
    heading(s.title);
    (s.text ?? []).forEach((t) => para(t, 9, [90, 90, 90]));
    if (s.chart && s.chart.values.length) {
      const n = Math.min(12, s.chart.values.length);
      const rowH = 6;
      ensure(n * rowH + 6);
      const max = Math.max(...s.chart.values.slice(0, n), 1);
      const labelW = 55;
      const barW = W - 2 * M - labelW - 22;
      pdf.setFontSize(8);
      for (let i = 0; i < n; i++) {
        const v = s.chart.values[i];
        pdf.setTextColor(60, 60, 60);
        pdf.text(pdfText(s.chart.labels[i]).slice(0, 34), M, y + 4);
        pdf.setFillColor(42, 120, 214);
        pdf.roundedRect(M + labelW, y + 0.8, Math.max(0.5, (v / max) * barW), rowH - 2, 0.8, 0.8, 'F');
        pdf.text(s.chart.unit === '%' ? `${v.toFixed(1).replace('.', ',')}%` : Math.round(v).toLocaleString('pt-BR'), M + labelW + (v / max) * barW + 2, y + 4);
        y += rowH;
      }
      y += 3;
    }
    if (s.table) {
      autoTable(pdf, {
        startY: y, head: [s.table.columns.map(pdfText)], body: s.table.rows.map((r) => r.map((v) => pdfText(String(v)))),
        styles: { fontSize: 7.5, cellPadding: 1.5 }, headStyles: { fillColor: [232, 238, 252], textColor: [20, 20, 20] }, margin: { left: M, right: M },
        columnStyles: Object.fromEntries((s.table.numeric ?? []).map((i) => [i, { halign: 'right' as const }])),
      });
      y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setTextColor(130, 130, 130);
    pdf.text(pdfText(`Gazin URA Intelligence${doc.simulated ? ' · DADOS SIMULADOS' : ''}`), M, H - 8);
    pdf.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: 'right' });
  }
  pdf.save(`${slug(doc.title)}.pdf`);
}
