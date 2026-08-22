import React, { useMemo, useState } from 'react'
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useFinance } from '@/context/FinanceContext'
import { useToast } from '@/hooks/use-toast'
import { FinancialItem, PALETTE_COLORS } from '@/types/finance'

interface ItemDraft {
  id?: string
  name: string
  classId: string
  categoryId: string | null
  color: string
  keywords: string[]
  aliases: string[]
  active: boolean
  validFrom?: number | null
  validTo?: number | null
}

const NEW_ITEM_DRAFT: ItemDraft = {
  name: '',
  classId: '',
  categoryId: null,
  color: PALETTE_COLORS[0],
  keywords: [],
  aliases: [],
  active: true,
  validFrom: null,
  validTo: null,
}

export default function Hierarchy() {
  const {
    financialClasses,
    financialCategories,
    financialItems,
    addFinancialItem,
    updateFinancialItem,
    deleteFinancialItem,
  } = useFinance()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(financialClasses.map((c) => c.id)),
  )
  const [editing, setEditing] = useState<ItemDraft | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [aliasInput, setAliasInput] = useState('')

  const visibleItems = useMemo(() => {
    if (!search.trim()) return financialItems
    const q = search.toLowerCase()
    return financialItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.aliases.some((a) => a.toLowerCase().includes(q)) ||
        i.keywords.some((k) => k.toLowerCase().includes(q)),
    )
  }, [financialItems, search])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startNew = (classId: string) => {
    setEditing({ ...NEW_ITEM_DRAFT, classId })
    setKeywordInput('')
    setAliasInput('')
  }

  const startEdit = (item: FinancialItem) => {
    setEditing({
      id: item.id,
      name: item.name,
      classId: item.classId,
      categoryId: item.categoryId,
      color: item.color,
      keywords: [...item.keywords],
      aliases: [...item.aliases],
      active: item.active,
      validFrom: item.validFrom ?? null,
      validTo: item.validTo ?? null,
    })
    setKeywordInput('')
    setAliasInput('')
  }

  const addKeyword = () => {
    if (!editing || !keywordInput.trim()) return
    setEditing({ ...editing, keywords: [...editing.keywords, keywordInput.trim()] })
    setKeywordInput('')
  }

  const addAlias = () => {
    if (!editing || !aliasInput.trim()) return
    setEditing({ ...editing, aliases: [...editing.aliases, aliasInput.trim()] })
    setAliasInput('')
  }

  const save = () => {
    if (!editing || !editing.name.trim() || !editing.classId) {
      toast({ title: 'Preencha nome e classe', variant: 'destructive' })
      return
    }
    if (editing.id) {
      updateFinancialItem(editing.id, {
        name: editing.name,
        classId: editing.classId,
        categoryId: editing.categoryId,
        color: editing.color,
        keywords: editing.keywords,
        aliases: editing.aliases,
        active: editing.active,
        validFrom: editing.validFrom,
        validTo: editing.validTo,
      })
      toast({ title: 'Item atualizado' })
    } else {
      addFinancialItem({
        name: editing.name,
        classId: editing.classId,
        categoryId: editing.categoryId,
        color: editing.color,
        keywords: editing.keywords,
        aliases: editing.aliases,
        active: editing.active,
        validFrom: editing.validFrom ?? null,
        validTo: editing.validTo ?? null,
        icon: undefined,
      })
      toast({ title: 'Item criado' })
    }
    setEditing(null)
  }

  const remove = (id: string) => {
    if (!confirm('Excluir este item? Transações vinculadas ficarão sem classificação.')) return
    deleteFinancialItem(id)
    toast({ title: 'Item removido' })
  }

  const categoriesInClass = (classId: string) =>
    financialCategories.filter((c) => c.classId === classId)

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-600" /> Hierarquia Financeira
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Estrutura de 3 níveis: <strong>Classe</strong> → <strong>Categoria</strong> →{' '}
            <strong>Item</strong>. Itens são as folhas onde as transações classificam.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar item, alias, palavra-chave..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3">
        {financialClasses.map((cls) => {
          const items = visibleItems.filter((i) => i.classId === cls.id)
          const isExpanded = expanded.has(cls.id)
          return (
            <Card key={cls.id} className="border-slate-200/80 shadow-xs">
              <CardHeader className="p-4 cursor-pointer" onClick={() => toggleExpanded(cls.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                    <CardTitle className="text-base font-bold">{cls.label}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">
                      {items.length} itens
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      startNew(cls.id)
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Novo item
                  </Button>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-y text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-2.5 text-left">Item</th>
                        <th className="p-2.5 text-left">Categoria</th>
                        <th className="p-2.5 text-left">Palavras-chave</th>
                        <th className="p-2.5 text-left">Aliases</th>
                        <th className="p-2.5 text-center">Ativo</th>
                        <th className="p-2.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400">
                            Nenhum item.
                          </td>
                        </tr>
                      )}
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-slate-50/60">
                          <td className="p-2.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: it.color }}
                              />
                              <span className="font-medium text-slate-900">{it.name}</span>
                            </div>
                          </td>
                          <td className="p-2.5 text-slate-500">
                            {it.categoryId
                              ? (financialCategories.find((c) => c.id === it.categoryId)?.name ??
                                '—')
                              : '—'}
                          </td>
                          <td className="p-2.5 text-slate-500">
                            <div className="flex flex-wrap gap-1">
                              {it.keywords.slice(0, 4).map((k, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-slate-100 rounded px-1.5 py-0.5"
                                >
                                  {k}
                                </span>
                              ))}
                              {it.keywords.length > 4 && (
                                <span className="text-[10px] text-slate-400">
                                  +{it.keywords.length - 4}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 text-slate-500">
                            <div className="flex flex-wrap gap-1">
                              {it.aliases.map((a, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5"
                                >
                                  {a}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-2.5 text-center">
                            <Switch
                              checked={it.active}
                              onCheckedChange={(v) => updateFinancialItem(it.id, { active: v })}
                              aria-label="Ativo"
                            />
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => startEdit(it)}
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                                onClick={() => remove(it.id)}
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Edit / create dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar item' : 'Novo item'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Classe</Label>
                  <Select
                    value={editing.classId}
                    onValueChange={(v) => setEditing({ ...editing, classId: v, categoryId: null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {financialClasses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria (opcional)</Label>
                  <Select
                    value={editing.categoryId ?? ''}
                    onValueChange={(v) => setEditing({ ...editing, categoryId: v || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {categoriesInClass(editing.classId).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {PALETTE_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setEditing({ ...editing, color: col })}
                      className={`w-6 h-6 rounded-full border-2 ${editing.color === col ? 'border-slate-900' : 'border-transparent'}`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Palavras-chave (para classificação automática)</Label>
                <div className="flex gap-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addKeyword()
                      }
                    }}
                    placeholder="Ex: mercado, compra"
                  />
                  <Button type="button" size="sm" onClick={addKeyword}>
                    Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editing.keywords.map((k, i) => (
                    <span
                      key={i}
                      className="text-[11px] bg-slate-100 rounded px-2 py-0.5 flex items-center gap-1"
                    >
                      {k}
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            keywords: editing.keywords.filter((_, idx) => idx !== i),
                          })
                        }
                      >
                        <X className="w-3 h-3 text-slate-400" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Aliases (nomes históricos)</Label>
                <div className="flex gap-2">
                  <Input
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addAlias()
                      }
                    }}
                    placeholder="Ex: IPVA+Licenciamento"
                  />
                  <Button type="button" size="sm" onClick={addAlias}>
                    Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editing.aliases.map((a, i) => (
                    <span
                      key={i}
                      className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-0.5 flex items-center gap-1"
                    >
                      {a}
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            aliases: editing.aliases.filter((_, idx) => idx !== i),
                          })
                        }
                      >
                        <X className="w-3 h-3 text-amber-500" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Válido de (ano)</Label>
                  <Input
                    type="number"
                    value={editing.validFrom ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        validFrom: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 2023"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Válido até (ano)</Label>
                  <Input
                    type="number"
                    value={editing.validTo ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        validTo: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 2025"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="item-active">Ativo</Label>
                <Switch
                  id="item-active"
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={save} className="bg-slate-900 hover:bg-slate-800">
              <Check className="w-4 h-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
