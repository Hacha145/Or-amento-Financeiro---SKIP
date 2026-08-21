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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Categorias & Classificação
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie os grupos de despesas/receitas e visualize as regras exatas aprendidas
          </p>
        </div>

        <Button
          onClick={handleOpenAdd}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Nova Categoria
        </Button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">
              Total de Categorias
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-slate-900">{categories.length}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">Disponíveis para classificação</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">
              Regras Exatas Memorizadas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-emerald-700">{learnedRules.length}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">Descrições exatas no motor</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">
              Lançamentos Vinculados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold text-slate-900">
              {transactions.filter((t) => t.categoryId).length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Transações categorizadas no app</p>
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
              className="border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow"
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-4 h-4 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: cat.color }}
                    />
                    <CardTitle className="text-base font-bold text-slate-900">{cat.name}</CardTitle>
                  </div>
                  {cat.isDefault && (
                    <Badge variant="outline" className="text-[10px] text-slate-500">
                      Padrão
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2 text-xs text-slate-600 space-y-1.5">
                <div className="flex justify-between">
                  <span>Lançamentos associados:</span>
                  <span className="font-semibold text-slate-900">{usageCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Regras exatas vinculadas:</span>
                  <span className="font-semibold text-emerald-700">{ruleCount}</span>
                </div>
              </CardContent>

              <CardFooter className="p-3 bg-slate-50/70 border-t flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-slate-600 hover:text-slate-900"
                  onClick={() => handleOpenEdit(cat)}
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-rose-600 hover:bg-rose-50"
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
        <Card className="border-slate-200/80 shadow-xs mt-8">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              Histórico de Regras Exatas Aprendidas ({learnedRules.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Sempre que uma transação tiver exatamente o mesmo texto, ela será classificada sem
              precisar de confirmação.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 max-h-60 overflow-y-auto">
            <div className="divide-y divide-slate-100 text-xs">
              {learnedRules.map((rule, idx) => {
                const cat = categories.find((c) => c.id === rule.categoryId)
                return (
                  <div
                    key={idx}
                    className="p-3 flex items-center justify-between hover:bg-slate-50/70"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {rule.exactDescription}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {cat && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{
                            backgroundColor: `${cat.color}15`,
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
                      <Badge variant="outline" className="text-[10px] text-slate-500">
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
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-600" />
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da Categoria</Label>
              <Input
                placeholder="Ex: Assinaturas, Pets, Farmácia..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Cor da Categoria</Label>
              <div className="grid grid-cols-7 gap-2 pt-1">
                {PALETTE_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSelectedColor(col)}
                    className={`w-8 h-8 rounded-full transition-transform flex items-center justify-center ${
                      selectedColor === col
                        ? 'scale-110 ring-2 ring-slate-900 ring-offset-2'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: col }}
                  >
                    {selectedColor === col && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
