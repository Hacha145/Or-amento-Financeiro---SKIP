import React, { useState, useMemo } from 'react'
import {
  Tag,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  BookOpen,
  HelpCircle,
  CheckCircle2,
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
import { useFinance } from '@/context/FinanceContext'
import { PALETTE_COLORS, Category } from '@/types/finance'
import { normalizeDescription } from '@/lib/learningEngine'
import { useToast } from '@/hooks/use-toast'

export default function Categories() {
  const { toast } = useToast()
  const { categories, transactions, learnedRules, addCategory, updateCategory, deleteCategory } =
    useFinance()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PALETTE_COLORS[0])

  // Count usage per category
  const categoryStats = useMemo(() => {
    const usageMap = new Map<string, number>()
    transactions.forEach((t) => {
      if (t.categoryId) {
        usageMap.set(t.categoryId, (usageMap.get(t.categoryId) || 0) + 1)
      }
    })

    const rulesMap = new Map<string, number>()
    learnedRules.forEach((r) => {
      rulesMap.set(r.categoryId, (rulesMap.get(r.categoryId) || 0) + 1)
    })

    return { usageMap, rulesMap }
  }, [transactions, learnedRules])

  const handleOpenAdd = () => {
    setEditingCategory(null)
    setName('')
    setSelectedColor(PALETTE_COLORS[categories.length % PALETTE_COLORS.length] || PALETTE_COLORS[0])
    setDialogOpen(true)
  }

  const handleOpenEdit = (cat: Category) => {
    setEditingCategory(cat)
    setName(cat.name)
    setSelectedColor(cat.color)
    setDialogOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (editingCategory) {
      updateCategory(editingCategory.id, {
        name: name.trim(),
        color: selectedColor,
      })
      toast({
        title: 'Categoria atualizada',
        description: `Categoria "${name.trim()}" atualizada com sucesso.`,
      })
    } else {
      addCategory(name.trim(), selectedColor)
      toast({
        title: 'Categoria criada',
        description: `Categoria "${name.trim()}" adicionada com sucesso.`,
      })
    }

    setDialogOpen(false)
  }

  const handleDelete = (cat: Category) => {
    if (confirm(`Tem certeza que deseja excluir a categoria "${cat.name}"?`)) {
      deleteCategory(cat.id)
      toast({
        title: 'Categoria excluída',
        description: 'Os lançamentos vinculados foram desassociados para revisão.',
      })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in text-[#F8FAFC]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]">
            Categorias &amp; Classificação
          </h1>
          <p className="text-xs sm:text-sm text-[#B6C2D4] mt-1">
            Gerencie os grupos de despesas/receitas e visualize as regras exatas aprendidas
          </p>
        </div>

        <Button
          onClick={handleOpenAdd}
          className="bg-[#047857] hover:bg-[#059669] text-white text-xs gap-1.5 shadow-sm rounded-xl h-10 px-4 font-medium"
        >
          <Plus className="w-4 h-4" />
          Nova Categoria
        </Button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-[#94A3B8] uppercase">
              Total de Categorias
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-[#F8FAFC] tabular-nums">
              {categories.length}
            </div>
            <p className="text-[11px] text-[#B6C2D4] mt-0.5">Disponíveis para classificação</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-[#94A3B8] uppercase">
              Regras Exatas Memorizadas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-emerald-400 tabular-nums">
              {learnedRules.length}
            </div>
            <p className="text-[11px] text-[#B6C2D4] mt-0.5">Descrições exatas no motor</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-[#94A3B8] uppercase">
              Lançamentos Vinculados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-[#F8FAFC] tabular-nums">
              {transactions.filter((t) => t.categoryId).length}
            </div>
            <p className="text-[11px] text-[#B6C2D4] mt-0.5">Transações categorizadas no app</p>
          </CardContent>
        </Card>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const usageCount = categoryStats.usageMap.get(cat.id) || 0
          const ruleCount = categoryStats.rulesMap.get(cat.id) || 0

          return (
            <Card
              key={cat.id}
              className="border-white/10 bg-[#192134] rounded-2xl shadow-sm flex flex-col justify-between hover:border-white/20 transition-all"
            >
              <CardHeader className="p-4 pb-2 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-4 h-4 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: cat.color }}
                    />
                    <CardTitle className="text-base font-bold text-[#F8FAFC]">{cat.name}</CardTitle>
                  </div>
                  {cat.isDefault && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-blue-300 bg-blue-500/10 border-blue-500/30"
                    >
                      Padrão
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-3 text-xs text-[#B6C2D4] space-y-2">
                <div className="flex justify-between">
                  <span>Lançamentos associados:</span>
                  <span className="font-semibold text-[#F8FAFC] tabular-nums">{usageCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Regras exatas vinculadas:</span>
                  <span className="font-semibold text-emerald-400 tabular-nums">{ruleCount}</span>
                </div>
              </CardContent>

              <CardFooter className="p-3 bg-[#101A34]/50 border-t border-white/5 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-[#B6C2D4] hover:text-[#F8FAFC] hover:bg-[#202A40] rounded-lg"
                  onClick={() => handleOpenEdit(cat)}
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg"
                  onClick={() => handleDelete(cat)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* Learned Rules Preview section */}
      {learnedRules.length > 0 && (
        <Card className="border-white/10 bg-[#192134] rounded-2xl shadow-sm mt-8">
          <CardHeader className="pb-3 border-b border-white/5">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-[#F8FAFC]">
              <BookOpen className="w-4 h-4 text-blue-400" />
              Histórico de Regras Exatas Aprendidas ({learnedRules.length})
            </CardTitle>
            <CardDescription className="text-xs text-[#B6C2D4]">
              O motor utiliza normalização inteligente (sem distinção de maiúsculas/minúsculas,
              acentos ou pontuações) para classificar lançamentos automaticamente sem falsos
              positivos.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 max-h-80 overflow-y-auto">
            <div className="divide-y divide-white/5 text-xs">
              {learnedRules.map((rule, idx) => {
                const cat = categories.find((c) => c.id === rule.categoryId)
                const normKey =
                  rule.normalizedDescription || normalizeDescription(rule.exactDescription)
                return (
                  <div
                    key={idx}
                    className="p-3.5 flex items-center justify-between hover:bg-[#202A40]/60 gap-4"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium text-[#F8FAFC] truncate">
                        {rule.exactDescription}
                      </span>
                      <span className="font-mono text-[10px] text-[#94A3B8] bg-[#101A34] border border-white/5 px-2 py-0.5 rounded w-fit">
                        chave: "{normKey}"
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {cat && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                          style={{
                            backgroundColor: `${cat.color}22`,
                            borderColor: `${cat.color}44`,
                            color: cat.color,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="text-[10px] text-[#94A3B8] border-white/10 bg-[#101A34]"
                      >
                        {rule.confirmCount}x confirmada
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL: ADD / EDIT CATEGORY */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[420px] bg-[#192134] text-[#F8FAFC] border border-white/10 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[#F8FAFC]">
              <Tag className="w-5 h-5 text-blue-400" />
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#B6C2D4]">Nome da Categoria</Label>
              <Input
                placeholder="Ex: Assinaturas, Pets, Farmácia..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="text-xs h-10 bg-[#101A34] text-[#F8FAFC] border-white/10 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#B6C2D4]">Cor da Categoria</Label>
              <div className="grid grid-cols-7 gap-2 pt-1">
                {PALETTE_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSelectedColor(col)}
                    className={`w-8 h-8 rounded-full transition-transform flex items-center justify-center ${
                      selectedColor === col
                        ? 'scale-110 ring-2 ring-blue-400 ring-offset-2 ring-offset-[#192134]'
                        : 'hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: col }}
                  >
                    {selectedColor === col && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

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
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-4 text-xs font-semibold"
              >
                Salvar Categoria
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
