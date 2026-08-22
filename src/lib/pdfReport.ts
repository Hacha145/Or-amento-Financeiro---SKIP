/**
 * Monthly PDF report generator (jsPDF + autotable).
 *
 * Uses the SAME consolidation engine as the dashboard so the numbers always
 * match. Produces a one-page (or two) report with period, income, expenses by
 * class, balance and top items.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { MonthConsolidation } from './consolidation'
import { formatCurrencyBRL } from './parsers'

export function exportMonthPdfReport(month: MonthConsolidation, monthLabel: string): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.text('Relatório Mensal', 40, 50)
  doc.setFontSize(11)
  doc.setTextColor(100, 116, 139)
  doc.text(`Período: ${monthLabel} (${month.monthKey})`, 40, 70)
  doc.text(
    `Dados atualizados até: ${month.lastTransactionDate ? formatBR(month.lastTransactionDate) : '—'}`,
    40,
    86,
  )

  // Summary table
  autoTable(doc, {
    startY: 110,
    head: [['Indicador', 'Valor']],
    body: [
      ['Receita', formatCurrencyBRL(month.income)],
      ['Investimentos (líquido)', formatCurrencyBRL(month.investmentsNet)],
      ['Total Despesas', formatCurrencyBRL(month.totalExpenses)],
      ['Saldo', formatCurrencyBRL(month.balance)],
      ['Transações pendentes', String(month.pendingReviewCount)],
    ],
    headStyles: { fillColor: [15, 23, 42] },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  })

  // Expenses by class
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 16,
    head: [['Classe de despesa', 'Total', '%']],
    body: month.expensesByClass.map((c) => [
      c.label,
      formatCurrencyBRL(c.total),
      `${c.percentage.toFixed(1)}%`,
    ]),
    headStyles: { fillColor: [220, 38, 38] },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  })

  // Top items
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 16,
    head: [['Item', 'Total', 'Qtd.']],
    body: month.topItems.map((it) => [it.itemName, formatCurrencyBRL(it.total), String(it.count)]),
    headStyles: { fillColor: [16, 185, 129] },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  })

  doc.save(`relatorio-${month.monthKey}.pdf`)
}

function formatBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
