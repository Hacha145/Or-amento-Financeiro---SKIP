import React, { useMemo, useState } from 'react'
import {
  ListChecks,
  Plus,
  Trash2,
  Edit2,
  Power,
  ArrowUp,
  ArrowDown,
  FlaskConical,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFinance } from '@/context/FinanceContext'
import { useToast } from '@/hooks/use-toast'
import { ClassificationRule } from '@/types/finance'
import { testRuleAgainstDescription, evaluateRule } from '@/lib/classificationEngine'
import { runClassificationTests } from '@/lib/classificationTests'
import { normalizeRaw } from '@/lib/tokenizer'
import { Transaction } from '@/types/finance'

const OPERATORS = [
  { value: 'contains', label: 'contém (token)' },
  { value: 'equals', label: 'igual a' },
  { value: 'startsWith', label: 'começa com' },
  { value: 'endsWith', label: 'termina com' },
  { value: 'regex', label: 'expressão regular' },
  { value: 'gt', label: 'maior que (valor)' },
  { value: 'lt', label: 'menor que (valor)' },
  { value: 'gte', label: 'maior ou igual (valor)' },
  { value: 'lte', label: 'menor ou igual (valor)' },
] as const

const FIELDS = [
  { value: 'description', label: 'Descrição' },
  { value: 'amount', label: 'Valor' },
  { value: 'type', label: 'Tipo (expense/income)' },
  { value: 'source', label: 'Origem' },
] as const

export default function Regras() {
  const { toast } = useToast()
  const {
    classificationRules,
    saveClassificationRule,
    deleteClassificationRule,
    financialItems,
    transactions,
  } = useFinance()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ClassificationRule | null>(null)
  const [name, setName] = useState('')
  const [priority, setPriority] = useState(100)
  const [field, setField] = useState<string>('description')
  const [operator, setOperator] = useState<string>('contains')
  const [value, setValue] = useState('')
  const [itemId, setItemId] = useState<string>('')
  const [status, setStatus] = useState<'active' | 'inactive'>('active')

  // Test panel
  const [testText, setTestText] = useState('')
  const [testResults, setTestResults] = useState<
    { ruleId: string; ruleName: string; matches: boolean }[] | null
  >(null)
  const [affectedRuleId, setAffectedRuleId] = useState<string | null>(null)
  const [affectedTxs, setAffectedTxs] = useState<Transaction[] | null>(null)

  // Classification self-tests (Part 3)
  const [testSummary, setTestSummary] = useState<ReturnType<typeof runClassificationTests> | null>(
    null,
  )

  const sortedRules = useMemo(
    () => [...classificationRules].sort((a, b) => a.priority - b.priority),
    [classificationRules],
  )

  const itemMap = useMemo(() => new Map(financialItems.map((i) => [i.id, i])), [financialItems])

  const itemLabel = (id: string) => {
    const it = itemMap.get(id)
    return it ? `${it.name}` : id
  }

  const handleOpenAdd = () => {
    setEditingRule(null)
    setName('')
    setPriority(100)
    setField('description')
    setOperator('contains')
    setValue('')
    setItemId(financialItems[0]?.id ?? '')
    setStatus('active')
    setDialogOpen(true)
  }

  const handleOpenEdit = (rule: ClassificationRule) => {
    setEditingRule(rule)
    setName(rule.name)
    setPriority(rule.priority)
    setField(rule.condition.field)
    setOperator(rule.condition.operator)
    setValue(rule.condition.value)
    setItemId(rule.action.itemId)
    setStatus(rule.status)
    setDialogOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !value.trim() || !itemId) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Nome, valor da condição e item de destino são obrigatórios.',
        variant: 'destructive',
      })
      return
    }
    const now = new Date().toISOString()
    const rule: ClassificationRule = {
      id: editingRule?.id ?? `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      priority: Number(priority) || 100,
      condition: {
        field: field as ClassificationRule['condition']['field'],
        operator: operator as ClassificationRule['condition']['operator'],
        value: value.trim(),
      },
      action: { itemId },
      status,
      applicationCount: editingRule?.applicationCount ?? 0,
      lastAppliedAt: editingRule?.lastAppliedAt ?? null,
      createdAt: editingRule?.createdAt ?? now,
      updatedAt: now,
    }
    saveClassificationRule(rule)
    toast({
      title: editingRule ? 'Regra atualizada' : 'Regra criada',
      description: `"${rule.name}" salva com prioridade ${rule.priority}.`,
    })
    setDialogOpen(false)
  }

  const handleDelete = (rule: ClassificationRule) => {
    if (confirm(`Excluir a regra "${rule.name}"?`)) {
      deleteClassificationRule(rule.id)
      toast({ title: 'Regra excluída', description: rule.name })
    }
  }

  const handleToggleActive = (rule: ClassificationRule) => {
    saveClassificationRule({
      ...rule,
      status: rule.status === 'active' ? 'inactive' : 'active',
      updatedAt: new Date().toISOString(),
    })
  }

  const handlePriority = (rule: ClassificationRule, delta: number) => {
    const newPriority = Math.max(1, rule.priority + delta)
    saveClassificationRule({ ...rule, priority: newPriority, updatedAt: new Date().toISOString() })
  }

  const handleRunTests = () => {
    setTestSummary(runClassificationTests())
  }

  const handleTestRule = (rule: ClassificationRule) => {
    if (!testText.trim()) {
      toast({ title: 'Digite um texto para testar', variant: 'destructive' })
      return
    }
    const results = classificationRules.map((r) => {
      // test against a fake transaction with the test text
      const fakeTx = {
        id: 'test',
        date: '2025-01-01',
        description: testText,
        amount: 0,
        type: 'expense' as const,
        source: 'manual',
        categoryId: null,
        needsReview: false,
        createdAt: '',
        updatedAt: '',
      } as unknown as Transaction
      return { ruleId: r.id, ruleName: r.name, matches: evaluateRule(r, fakeTx) }
    })
    setTestResults(results)
    toast({
      title: 'Teste executado',
      description: `${results.filter((r) => r.matches).length} regra(s) corresponderam.`,
    })
  }

  const handleViewAffected = (rule: ClassificationRule) => {
    const affected = transactions.filter((t) => {
      const fakeTx = { ...t, id: 'test' } as Transaction
      return evaluateRule(rule, fakeTx)
    })
    setAffectedRuleId(rule.id)
    setAffectedTxs(affected)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in text-[#F8FAFC]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-white/5">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5 font-['Lexend']">
            <ListChecks className="w-6 h-6 text-blue-400" />
            Regras de Classificação
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
            Regras baseadas em <strong className="text-white">tokens</strong> (palavras completas).
            "OVOS" nunca casa com "NOVOS" — a correspondência é por token, não por substring.
            Prioridade menor = avaliada primeiro.
          </p>
        </div>
        <Button
          onClick={handleOpenAdd}
          className="bg-[#059669] hover:bg-[#059669]/90 text-white text-xs gap-1.5 shadow-sm rounded-lg h-9 px-4 font-semibold cursor-pointer transition-transform hover:-translate-y-0.5 focus:ring-2 focus:ring-white"
        >
          <Plus className="w-4 h-4" />
          Nova Regra
        </Button>
      </div>
      {/* Test box */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-white/5">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-[#F8FAFC]">
            <FlaskConical className="w-4 h-4 text-blue-400" />
            Testar regras &amp; auto-diagnóstico
          </CardTitle>
          <CardDescription className="text-xs text-[#B6C2D4]">
            Digite uma descrição para ver quais regras correspondem, e rode os testes obrigatórios
            da Parte 3 do prompt.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Ex: MERCADO LIVRE NOVOS"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl flex-1 placeholder:text-[#94A3B8]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rule = sortedRules[0]
                if (rule) handleTestRule(rule)
                else toast({ title: 'Crie uma regra primeiro', variant: 'destructive' })
              }}
              className="text-xs h-10 border-white/10 bg-[#202A40] text-[#F8FAFC] hover:bg-[#202A40]/80 rounded-xl"
            >
              Testar contra todas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunTests}
              className="text-xs h-10 border-white/10 bg-[#202A40] text-blue-300 hover:bg-[#202A40]/80 rounded-xl"
            >
              Rodar testes (Parte 3)
            </Button>
          </div>

          {testResults && (
            <div className="space-y-1.5 text-xs pt-1">
              <div className="font-semibold text-[#B6C2D4] mb-1">
                Resultado do teste "{testText}":
              </div>
              {testResults.length === 0 && (
                <div className="text-[#94A3B8]">Nenhuma regra cadastrada.</div>
              )}
              {testResults.map((r) => (
                <div
                  key={r.ruleId}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101A34] border border-white/5"
                >
                  {r.matches ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span className="font-medium text-[#F8FAFC]">{r.ruleName}</span>
                  <span className={r.matches ? 'text-emerald-400 font-semibold' : 'text-[#94A3B8]'}>
                    {r.matches ? 'correspondeu' : 'não correspondeu'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {testSummary && (
            <div className="space-y-2 text-xs border-t border-white/5 pt-3">
              <div className="font-semibold text-[#B6C2D4]">
                Testes obrigatórios (Parte 3):{' '}
                <span className="text-emerald-400">{testSummary.passed}</span>/{testSummary.total}{' '}
                passaram
                {testSummary.failed > 0 && (
                  <span className="text-rose-400 font-bold"> · {testSummary.failed} falharam</span>
                )}
              </div>
              {testSummary.results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-[#101A34] border border-white/5"
                >
                  {r.pass ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-[#F8FAFC]">{r.description}</div>
                    <div className="text-[11px] text-[#94A3B8]">{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Rules table */}
      <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-white/5">
          <CardTitle className="text-base font-bold text-[#F8FAFC]">
            Regras ({sortedRules.length})
          </CardTitle>
          <CardDescription className="text-xs text-[#B6C2D4]">
            Avaliadas em ordem de prioridade. A primeira regra que casa vence.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sortedRules.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#94A3B8]">
              Nenhuma regra cadastrada. Clique em{' '}
              <strong className="text-[#F8FAFC]">Nova Regra</strong> para criar a primeira.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-semibold uppercase text-[#94A3B8] bg-[#101A34]">
                <div className="col-span-1">Prio</div>
                <div className="col-span-3">Regra</div>
                <div className="col-span-3">Correspondência</div>
                <div className="col-span-3">Destino</div>
                <div className="col-span-2 text-right">Ações</div>
              </div>
              {sortedRules.map((rule) => {
                const target = itemMap.get(rule.action.itemId)
                const isActive = rule.status === 'active'
                return (
                  <div
                    key={rule.id}
                    className={`grid grid-cols-1 sm:grid-cols-12 gap-2 px-4 py-3 text-xs items-center hover:bg-[#202A40]/40 transition-colors ${
                      !isActive ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="sm:col-span-1 flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono px-1.5 bg-[#101A34] text-[#B6C2D4] border-white/10"
                      >
                        {rule.priority}
                      </Badge>
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-[#94A3B8] hover:text-[#F8FAFC]"
                          onClick={() => handlePriority(rule, -1)}
                          title="Diminuir prioridade"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-[#94A3B8] hover:text-[#F8FAFC]"
                          onClick={() => handlePriority(rule, 1)}
                          title="Aumentar prioridade"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <div className="font-semibold text-[#F8FAFC]">{rule.name}</div>
                      <div className="text-[10px] text-[#94A3B8]">
                        {rule.applicationCount ?? 0}x aplicada
                      </div>
                    </div>
                    <div className="sm:col-span-3 font-mono text-[11px] text-[#B6C2D4]">
                      {rule.condition.field}{' '}
                      <span className="text-blue-400">{rule.condition.operator}</span>{' '}
                      <span className="bg-[#101A34] border border-white/5 px-1.5 py-0.5 rounded text-[#F8FAFC]">
                        '{normalizeRaw(rule.condition.value) || rule.condition.value}'
                      </span>
                    </div>
                    <div className="sm:col-span-3">
                      {target ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          {target.name}
                        </span>
                      ) : (
                        <span className="text-rose-400 text-[11px]">item ausente</span>
                      )}
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] h-11 w-11 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
                        onClick={() => handleViewAffected(rule)}
                        aria-label={`Ver transações afetadas pela regra ${rule.name}`}
                        title="Ver transações afetadas"
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] h-11 w-11 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
                        onClick={() => handleToggleActive(rule)}
                        aria-label={
                          isActive ? `Desativar regra ${rule.name}` : `Ativar regra ${rule.name}`
                        }
                        title={isActive ? 'Desativar' : 'Ativar'}
                      >
                        <Power
                          className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-[#94A3B8]'}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] h-11 w-11 text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
                        onClick={() => handleOpenEdit(rule)}
                        aria-label={`Editar regra ${rule.name}`}
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] h-11 w-11 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg"
                        onClick={() => handleDelete(rule)}
                        aria-label={`Excluir regra ${rule.name}`}
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Affected transactions dialog */}
      <Dialog open={affectedTxs !== null} onOpenChange={(o) => !o && setAffectedTxs(null)}>
        <DialogContent className="sm:max-w-[560px] bg-[#192134] text-[#F8FAFC] border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[#F8FAFC]">
              <ListChecks className="w-5 h-5 text-blue-400" />
              Transações afetadas
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-[#B6C2D4] max-h-96 overflow-y-auto">
            {affectedTxs && affectedTxs.length === 0 && (
              <div className="p-4 text-center text-[#94A3B8]">
                Nenhuma transação existente corresponde a esta regra.
              </div>
            )}
            {affectedTxs && affectedTxs.length > 0 && (
              <div className="divide-y divide-white/5">
                {affectedTxs.slice(0, 100).map((t) => (
                  <div
                    key={t.id}
                    className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-[#202A40]/40 rounded-lg"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[#F8FAFC] truncate">{t.description}</div>
                      <div className="text-[10px] text-[#94A3B8]">
                        {t.date} · {t.type === 'income' ? 'Receita' : 'Despesa'}
                      </div>
                    </div>
                    <div className="font-semibold text-[#F8FAFC] text-xs whitespace-nowrap tabular-nums">
                      R$ {t.amount.toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                ))}
                {affectedTxs.length > 100 && (
                  <div className="px-2 py-2 text-center text-[11px] text-[#94A3B8]">
                    +{affectedTxs.length - 100} transação(ões)...
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAffectedTxs(null)}
              className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] bg-[#192134] text-[#F8FAFC] border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[#F8FAFC]">
              <ListChecks className="w-5 h-5 text-blue-400" />
              {editingRule ? 'Editar Regra' : 'Nova Regra'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#B6C2D4]">Nome da regra</Label>
              <Input
                placeholder="Ex: Mercado Livre → Compras marketplace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#B6C2D4]">Prioridade (menor = antes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#B6C2D4]">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'inactive')}>
                  <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="inactive">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#B6C2D4]">Campo</Label>
                <Select value={field} onValueChange={setField}>
                  <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    {FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#B6C2D4]">Operador</Label>
                <Select value={operator} onValueChange={setOperator}>
                  <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10">
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#B6C2D4]">Valor</Label>
                <Input
                  placeholder="OVOS"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl"
                />
              </div>
            </div>
            <div className="text-[11px] text-[#B6C2D4] bg-[#101A34] border border-white/5 rounded-xl p-3 leading-relaxed">
              <strong className="text-[#F8FAFC]">Token-based:</strong> "contém OVOS" casa só com a
              palavra completa "OVOS" (token). Nunca casa com "NOVOS". Para frases, use o texto
              completo ("MERCADO LIVRE").
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#B6C2D4]">Item de destino</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl">
                  <SelectValue placeholder="Selecione o item..." />
                </SelectTrigger>
                <SelectContent className="bg-[#192134] text-[#F8FAFC] border-white/10 max-h-72">
                  {financialItems.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {value && field === 'description' && (
              <div className="text-[11px] text-[#B6C2D4] bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <strong className="text-blue-300">Pré-visualização:</strong>{' '}
                {(() => {
                  const fakeRule = {
                    condition: {
                      field: field as ClassificationRule['condition']['field'],
                      operator: operator as ClassificationRule['condition']['operator'],
                      value,
                    },
                    status: 'active' as const,
                  }
                  const sample = ['COMPRA DE OVOS', 'NOVOS SERVICOS', 'MERCADO LIVRE NOVOS', value]
                  return sample.map((s) => {
                    const r = testRuleAgainstDescription(fakeRule, s)
                    return (
                      <div key={s} className="flex items-center gap-1.5 mt-1">
                        {r.matches ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-slate-500" />
                        )}
                        <span className="font-mono text-[#F8FAFC]">"{s}"</span>
                        <span
                          className={
                            r.matches ? 'text-emerald-400 font-semibold' : 'text-[#94A3B8]'
                          }
                        >
                          {r.matches ? 'corresponde' : 'ignora'}
                        </span>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                className="border-white/10 bg-transparent text-[#B6C2D4] hover:bg-[#202A40] hover:text-[#F8FAFC] rounded-xl h-10 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-[#059669] hover:bg-[#059669]/90 text-white rounded-lg h-10 px-4 text-xs font-semibold cursor-pointer transition-transform hover:-translate-y-0.5"
              >
                Salvar Regra
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>{' '}
    </div>
  )
}
