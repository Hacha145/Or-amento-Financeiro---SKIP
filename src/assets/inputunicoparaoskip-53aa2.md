# Especificação única para reestilização do Orçamento Pessoal

## 1. Finalidade deste documento

Este documento é a especificação autocontida da reestilização visual do aplicativo **Orçamento Pessoal**. Ele deve ser lido integralmente antes de qualquer alteração e usado como fonte de verdade durante toda a execução na plataforma SKIP.

O trabalho solicitado é uma reestilização completa do aplicativo existente. Não é uma reconstrução, um protótipo isolado, uma landing page ou a criação de um novo produto. O resultado deve manter todas as funcionalidades, rotas, dados e regras existentes, mudando somente a apresentação e a experiência visual.

O sistema visual foi derivado das recomendações do repositório UI UX Pro Max e consolidado aqui para eliminar ambiguidades dos materiais brutos. Não é necessário consultar esse repositório para executar o trabalho.

## 2. Resultado obrigatório

Ao concluir, o aplicativo deve:

- apresentar um sistema visual escuro, coeso, moderno e adequado a finanças pessoais;
- manter a marca textual **Orçamento Pessoal**;
- usar `pt-BR` no documento HTML e substituir o título/metadados genéricos do template pela marca do produto;
- cobrir todas as rotas e todos os fluxos já existentes;
- manter os mesmos dados reais e as mesmas ações conectadas;
- continuar responsivo em celular, tablet e desktop;
- continuar acessível por teclado e compreensível sem depender apenas de cor;
- continuar compilando e passando pelos testes do projeto;
- não conter telas fictícias, números hard-coded, botões sem ação ou placeholders deixados como resultado final;
- não alterar arquivos protegidos, componentes-base fora do escopo, contratos de dados ou regras de negócio.

Não encerre o trabalho após diagnóstico, plano, criação de tokens ou reestilização apenas do dashboard. Faça a implementação visual completa e a verificação de todas as rotas descritas neste documento.

## 3. Decisões já tomadas

Estas decisões são obrigatórias nesta rodada e não precisam de nova confirmação:

1. A marca continua sendo **Orçamento Pessoal**.
2. Não criar nem adicionar logo com o texto “SKIP”.
3. O tema será **exclusivamente escuro** nesta rodada.
4. Não criar seletor ou alternância de tema.
5. Não implementar tema claro.
6. Usar somente fontes de sistema, disponíveis offline.
7. Não importar Google Fonts e não realizar chamadas externas para carregar fontes.
8. Não criar rotas, telas, módulos de negócio ou funcionalidades novas.
9. Não criar nova rota ou tela de gestão de contas ou cartões. Preserve integralmente as entidades, os campos e os seletores de conta/cartão já usados nos lançamentos. Também não adicionar metas financeiras, relatórios como nova rota, perfil, login, cadastro, recuperação de acesso, busca global, avatar, central de notificações ou ocultação de saldo se esses recursos não existirem no código atual.
10. Não modificar nenhum arquivo coberto por `preventAI` em `.skip.config.json`.
11. Tratar `src/components/ui/**` como fora do escopo de edição: essa pasta está excluída do contexto fornecido à plataforma e não deve ser modificada.
12. Executar a reestilização completa e rodar as verificações de qualidade ao final.
13. Em `index.html`, definir somente `lang="pt-BR"`, `<title>Orçamento Pessoal</title>`, `meta description` como “Aplicativo de orçamento pessoal para controle financeiro.” e `meta author` como “Orçamento Pessoal”; preservar literalmente os comentários e scripts `@skip-protected` e os demais elementos do arquivo.

## 4. Ordem de precedência

Se houver qualquer divergência entre fontes, siga esta ordem:

1. funcionamento e regras já presentes no código atual;
2. restrições de proteção deste documento e de `.skip.config.json`;
3. inventário funcional e critérios de aceite deste documento;
4. direção visual e tokens definidos neste documento;
5. imagens de referência anexadas;
6. protótipos ou materiais brutos, caso tenham sido fornecidos apenas como referência secundária.

As imagens nunca autorizam a criação de uma função ausente. Quando uma imagem mostrar conteúdo ou navegação que não existe no projeto, preserve a composição visual aplicável, mas ignore o recurso inexistente.

## 5. Código e stack atuais

O projeto analisado é o template `skip-react-template`, versão `0.0.18`, com build de desenvolvimento identificado em `.skip.config.json` como `53ca90c`.

Stack existente:

- React 19;
- Vite 8;
- TypeScript;
- Tailwind CSS 3;
- shadcn UI sobre Radix UI;
- `lucide-react` para ícones;
- Recharts para gráficos;
- React Router 7 para rotas;
- React Hook Form e Zod para formulários e validações;
- Sonner e o sistema de toast existente para feedback;
- armazenamento local, backup e restauração já implementados;
- PocketBase presente no projeto, sem autorização para mudança nesta tarefa.

Use somente as dependências já declaradas no `package.json` e no projeto. Não instale, remova ou troque pacotes e não adicione GSAP, outra biblioteca de UI, outro pacote de ícones, outra biblioteca de gráficos ou qualquer dependência de tema.

## 6. Limites de edição

### 6.1 Arquivos e áreas que não podem ser modificados

Não modifique:

- qualquer arquivo correspondente aos padrões de `preventAI` em `.skip.config.json`;
- `.skip.config.json`;
- `package.json` e arquivos de lock;
- configurações do TypeScript, Vite, PostCSS, npm ou lint/format;
- arquivos de imagem, SVG, ícones ou outros assets cobertos por `preventAI`;
- `.env*`;
- `src/components/ui/**`, que está excluído do contexto da plataforma e deve permanecer fora do escopo de edição;
- `src/main.tsx` e seus comentários `@skip-protected`;
- os scripts e comentários `@skip-protected` de `index.html`;
- `src/App.tsx` e a definição das rotas, pois esta tarefa não exige mudança de roteamento;
- `src/context/FinanceContext.tsx`;
- `src/types/finance.ts`;
- os módulos de negócio em `src/lib/**`;
- regras de armazenamento, importação, classificação, consolidação, exportação, backup ou criptografia.

Os seguintes módulos são especialmente sensíveis e devem permanecer funcionalmente e estruturalmente intactos:

- `src/lib/storage.ts`;
- `src/lib/catalog.ts`;
- `src/lib/classificationEngine.ts`;
- `src/lib/classificationTests.ts`;
- `src/lib/tokenizer.ts`;
- `src/lib/merchants.ts`;
- `src/lib/learningEngine.ts`;
- `src/lib/consolidation.ts`;
- `src/lib/parsers.ts`;
- `src/lib/templateMap.ts`;
- `src/lib/templateImporter.ts`;
- `src/lib/xlsxExport.ts`;
- `src/lib/pdfReport.ts`;
- `src/lib/cryptoBackup.ts`;
- `src/lib/annualSummaryService.ts`;
- integrações em `src/lib/pocketbase/**`.

Não renomeie IDs, enums, campos ou tipos. O modelo legado baseado em `Category/categoryId` convive com o modelo v2 baseado em `FinancialCategory`, `FinancialItem/itemId`; não tente unificá-los ou “simplificá-los”.

### 6.2 Áreas autorizadas para a reestilização

Concentre as alterações visuais em:

- `src/main.css`, preservando regras e comentários obrigatórios já existentes;
- `index.html`, exclusivamente para os quatro valores exatos definidos na decisão 13, sem tocar em scripts, comentários `@skip-protected`, `og:image` ou no restante da estrutura;
- `src/components/Layout.tsx`;
- `src/components/MonthSelector.tsx`;
- `src/components/YearSelector.tsx`;
- `src/components/NewTransactionDialog.tsx`;
- `src/components/TemplateImportReport.tsx`;
- `src/pages/*.tsx`;
- novos componentes exclusivamente de apresentação em uma pasta fora de `src/components/ui/**`, somente quando reduzirem duplicação e sem adicionar função de negócio.

Mantenha `tailwind.config.ts` fora do escopo desta tarefa; não é necessário alterá-lo. Use as classes Tailwind já disponíveis, valores arbitrários quando indispensáveis e tokens CSS definidos em `src/main.css`. Como `src/components/ui/**` está excluído do contexto e fora do escopo, estilize as instâncias shadcn/Radix por `className`, composição e estrutura nas páginas/componentes autorizados; não edite os primitives. Não execute `shadcn init`, `shadcn add` nem dependa de `components.json` para esta reestilização.

## 7. Inventário real de rotas

Preserve exatamente as rotas atuais:

| Rota             | Tela                    | Função principal                                                                                    |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `/boas-vindas`   | Boas-vindas/onboarding  | Iniciar com planilha, demonstração ou base vazia                                                    |
| `/`              | Painel Financeiro       | Visões mensal e anual, indicadores e consolidações                                                  |
| `/transacoes`    | Transações              | Consultar, filtrar, revisar, editar, excluir e exportar lançamentos                                 |
| `/importar`      | Importação              | Importar OFX e CSV/TXT delimitado no fluxo múltiplo; usar template histórico XLSX no fluxo dedicado |
| `/orcamento`     | Orçamento Mensal        | Gerenciar limites por categoria e acompanhar uso                                                    |
| `/categorias`    | Categorias              | CRUD do modelo legado e consulta de regras aprendidas                                               |
| `/hierarquia`    | Hierarquia Financeira   | Gerenciar Classe → Categoria → Item                                                                 |
| `/regras`        | Regras de Classificação | Criar, testar, priorizar, ativar e excluir regras                                                   |
| `/configuracoes` | Configurações & Backup  | Preferências, exportações, backups, restauração e reset                                             |
| `*`              | 404                     | Informar rota inexistente e permitir retorno seguro                                                 |

A lógica atual de onboarding condicional na rota `/` deve permanecer igual.

## 8. Funcionalidades obrigatórias por área

### 8.1 Layout global

Preserve:

- navegação desktop;
- menu lateral/drawer em tablet;
- navegação inferior em celular com as cinco destinações atuais; as demais rotas continuam acessíveis pelo drawer/menu existente;
- indicação da rota ativa;
- badge com quantidade de transações pendentes;
- indicação da data até a qual os dados estão atualizados;
- botão global de novo lançamento;
- modal global `NewTransactionDialog` e todas as suas ações;
- lembrete de armazenamento/backup local;
- todos os links, tooltips e destinos atuais.

A marca exibida deve ser “Orçamento Pessoal”. É permitido continuar usando um ícone Lucide já existente, como `Wallet`, como elemento de interface, mas não criar um logo SKIP ou um novo asset de marca.

### 8.2 `/boas-vindas`

Preserve o onboarding completo e seus caminhos:

- começar com uma planilha;
- começar com dados de demonstração;
- começar do zero;
- upload e leitura correta de CSV/TXT delimitado e XLSX binário;
- tratamento binário de XLSX;
- distinção entre template histórico anual e tabela plana;
- diagnóstico da planilha;
- mapeamento de colunas;
- decisão de importar ou não os dados;
- relatório de importação do template;
- mensagens de erro e sucesso;
- navegação final ao painel.

Reestilize todos os passos, não somente a primeira tela.

Não prometa suporte ao formato XLS binário legado e não altere `accept`, leitores ou parsers nesta tarefa visual.

### 8.3 `/` — Painel Financeiro

Preserve:

- alternância entre visão mensal e anual;
- seletor de mês na visão mensal;
- seletor de ano na visão anual;
- aviso e ação para revisar transações pendentes;
- indicadores de receitas, despesas, saldo e taxa de economia;
- comparações com período anterior;
- consolidação financeira por seis classes;
- histórico e evolução temporal;
- gráficos Recharts já existentes;
- despesas por categoria;
- progresso de orçamento;
- transações recentes;
- estados sem dados e links para importar/adicionar dados;
- drill-down de mês na visão anual;
- todos os cálculos e formatações atuais.

Preserve, sem unificar ou reapontar, as cadeias de agregação existentes: `monthlyStats`, `monthConsolidation`/`yearConsolidation` e o `annualStats` local. Preserve também a coexistência intencional entre o modelo legado `Category`/`categoryId` e o modelo v2 `FinancialCategory`/`FinancialItem`/`itemId`.

Não substitua os gráficos por SVG estático e não use os números das imagens. Os gráficos devem continuar recebendo dados reais.

### 8.4 `/transacoes`

Preserve:

- busca por descrição ou observação;
- filtros por categoria, tipo e status;
- leitura do filtro de status vindo da query string;
- seletor de mês;
- seleção individual e seleção em lote;
- classificação/atribuição em lote;
- exclusão em lote;
- sugestão e confirmação de classificação;
- edição de lançamento;
- exclusão individual;
- observações e campos atuais;
- exportação da visualização filtrada para CSV;
- modais e ações atuais, sem inventar confirmação nova para exclusão;
- estados vazio, pendente, confirmado e resultados filtrados.

Em celular, a tabela pode virar lista de cards ou usar rolagem horizontal apenas dentro de um contêiner identificado e acessível. Nunca gere rolagem horizontal na página inteira.

### 8.5 `/importar`

Preserve a máquina de estados e os dois fluxos existentes:

1. upload → mapeamento quando necessário → prévia → confirmação → sucesso;
2. importação de template XLSX histórico → diagnóstico/relatório → conclusão.

Preserve também:

- importação de múltiplos arquivos;
- OFX e CSV/TXT delimitado no fluxo múltiplo, além do template histórico XLSX no fluxo dedicado;
- drag-and-drop e seletor de arquivo;
- mapeamento manual de colunas;
- prévia com ajuste de categoria e remoção de linhas, sem transformar essa etapa em edição completa do lançamento;
- remoção de item da prévia;
- seleção/alteração de categoria;
- correspondências exatas;
- sugestões automáticas;
- itens pendentes de revisão;
- alertas de possível duplicação e pagamento de fatura;
- resumo do resultado;
- relatório de divergências e reconciliação do template;
- todas as mensagens de validação e erro.

Esta é uma das telas mais complexas. Não simplifique ou remova etapas para adequá-la ao novo visual.

Não transforme XLSX em formato genérico do fluxo múltiplo, não prometa suporte ao XLS binário legado e não altere `accept`, leitores ou parsers nesta tarefa visual.

### 8.6 `/orcamento`

Preserve:

- seletor de mês;
- limites por categoria;
- total orçado, gasto e restante;
- progresso por categoria;
- alertas nos limiares atuais de 75% e 100%;
- criar, editar e remover limite;
- modal e validação de valor;
- estados sem orçamento ou sem gasto.

Não transformar “limite de orçamento” em uma funcionalidade nova de meta financeira.

### 8.7 `/categorias`

Preserve:

- criação, edição e exclusão de categorias do modelo legado;
- nome e cor;
- contadores associados;
- badge/sinalização da categoria padrão, sem inventar uma trava de exclusão que não existe;
- lógica atual de exclusão: desvincular lançamentos, marcá-los para revisão e remover o orçamento correspondente, conforme o código existente;
- exibição das regras exatas aprendidas;
- mensagens de sucesso e erro.

Não fundir esta tela com a Hierarquia. Os dois modelos coexistem por compatibilidade.

### 8.8 `/hierarquia`

Preserve:

- estrutura Classe → Categoria → Item;
- as seis classes, 18 categorias e 78 itens do catálogo de referência atual;
- busca por item, alias e palavra-chave;
- expansão e recolhimento dos grupos;
- criação e edição de item;
- ativação/desativação;
- nome, classe, categoria opcional, cor, palavras-chave, aliases, anos de validade e estado ativo, conforme os campos já existentes;
- exclusão com confirmação;
- vínculos existentes e IDs do catálogo.

Não alterar a taxonomia nem reclassificar dados como parte da reestilização.

As contagens do catálogo de referência não autorizam reseed, sobrescrita de dados persistidos ou descarte de personalizações do usuário.

### 8.9 `/regras`

Preserve:

- criação, edição e exclusão de regras;
- ativação/desativação;
- prioridade e seus controles;
- padrões/tokens usados na regra;
- vínculo ao item financeiro;
- campo para testar uma descrição;
- teste global da descrição contra o conjunto de regras, exibindo as correspondências encontradas;
- suíte de autotestes existente;
- visualização das transações afetadas;
- feedback de correspondência e validações.

O mecanismo de tokenização e a precedência das regras não podem ser alterados.

### 8.10 `/configuracoes`

Preserve:

- preferência relativa à dupla contagem de pagamentos de fatura;
- configuração/mapeamento de planilha;
- retorno ao onboarding quando acionado pelo usuário;
- exportação CSV;
- exportação XLSX com template opcional e fórmulas;
- seleção de anos para exportação;
- geração de relatório mensal em PDF;
- backup JSON;
- restauração de backup JSON;
- backup criptografado AES-GCM com senha;
- restauração de backup criptografado;
- carregamento de dados de demonstração;
- reset total com confirmação e comunicação clara de risco;
- todos os estados de processamento, erro e sucesso.

A zona destrutiva deve ser visualmente separada, sem alterar sua confirmação ou sua lógica.

### 8.11 Rota 404

Mantenha a rota curinga, o `console.error`/diagnóstico e o destino `/` do link existente. Traduza os textos visíveis para `pt-BR`, reestilize a página para o tema escuro e ofereça retorno claro ao painel sem criar nova navegação.

## 9. Sistema visual consolidado

### 9.1 Princípios

- Produto financeiro sóbrio, confiável e de alta legibilidade.
- Dark-first convertido nesta rodada em **dark-only**.
- Hierarquia por espaçamento, tipografia, contraste e agrupamento; não por excesso de efeitos.
- Glassmorphism leve apenas em superfícies nas quais o contraste continue adequado.
- Sem gradientes roxo/rosa, brilho neon, ruído visual ou animação decorativa intensa.
- Sem fundos brancos ou tema claro.
- Densidade suficiente para análise de dados sem sacrificar alvos de toque.
- Ícones exclusivamente da biblioteca Lucide já declarada no projeto.
- Emojis não devem ser usados como ícones de interface.

Implemente o tema dark-only diretamente em `:root` de `src/main.css`; não dependa da presença de uma classe `.dark`. Aplique a pilha de fontes e o fundo no `body` e garanta que superfícies renderizadas em portals — como Dialog, Select, Tooltip e Toast — recebam os mesmos tokens escuros.

### 9.2 Paleta obrigatória

Defina tokens coerentes em `src/main.css` e reutilize-os nas áreas autorizadas.

| Papel                     |        Valor recomendado | Uso                                                                                         |
| ------------------------- | -----------------------: | ------------------------------------------------------------------------------------------- |
| Fundo principal           |                `#0F172A` | plano geral                                                                                 |
| Fundo profundo            |                `#09101F` | sidebar, navegação e áreas de maior profundidade                                            |
| Superfície padrão         |                `#192134` | cards, painéis e popovers                                                                   |
| Superfície elevada        |                `#202A40` | elementos elevados, hover e menus                                                           |
| Superfície discreta       |                `#101A34` | áreas agrupadas e estados sutis                                                             |
| Texto principal           |                `#F8FAFC` | títulos, números e conteúdo principal                                                       |
| Texto secundário          |                `#B6C2D4` | textos de apoio                                                                             |
| Texto atenuado            |                `#94A3B8` | metadados, mantendo contraste AA                                                            |
| Primária forte            |                `#1E40AF` | identidade, seleção e áreas de destaque                                                     |
| Primária                  |                `#2563EB` | botões principais com texto branco quando o contraste atender AA                            |
| Interação azul            |                `#3B82F6` | bordas, gráficos e hover; não usar como fundo de texto pequeno branco se o contraste falhar |
| Link/foco em fundo escuro |                `#93C5FD` | links e foco visível                                                                        |
| CTA/sucesso preenchido    |                `#047857` | botão de sucesso com texto branco                                                           |
| Sucesso                   |                `#059669` | progresso, borda e destaque                                                                 |
| Receita/sucesso claro     |                `#34D399` | texto e indicador em superfície escura                                                      |
| Despesa                   |                `#FB7185` | valores e séries de despesa                                                                 |
| Destrutivo                |                `#DC2626` | excluir, reset e erro destrutivo                                                            |
| Alerta                    |                `#F59E0B` | pendência e limite próximo                                                                  |
| Bordas                    | `rgba(255,255,255,0.09)` | divisão padrão                                                                              |
| Bordas fortes             | `rgba(255,255,255,0.16)` | foco estrutural e hover                                                                     |

Os valores hexadecimais acima são referências visuais. O `tailwind.config.ts` atual consome os tokens semânticos como `hsl(var(--background))`, `hsl(var(--border))` e equivalentes. Portanto, em cada token já envolvido por `hsl(var(--…))`, mantenha somente os componentes HSL, sem `hsl()`, hex ou `rgba()`. Exemplo correto: `--background: 222.2 47.4% 11.2%;` para `#0F172A`; exemplo incorreto: `--background: #0F172A;`. Para transparências de borda, crie variável auxiliar separada ou aplique cor/alpha diretamente na propriedade; não coloque `rgba(...)` em `--border`, `--input` ou outro token envolvido por `hsl(...)`.

Regras semânticas:

- receita e sucesso: verde;
- despesa: rosa/vermelho claro, sempre acompanhado de sinal, texto ou rótulo;
- ação destrutiva e erro crítico: vermelho `#DC2626`;
- aviso, pendência e orçamento próximo do limite: âmbar;
- interação geral: azul;
- nunca comunicar estado somente pela cor.

A paleta nova vale para chrome, superfícies, interação, feedback e séries agregadas. Preserve integralmente as cores que vêm das entidades e do catálogo — incluindo `Category.color`, `FinancialClass.color`, `FinancialCategory.color` e `FinancialItem.color` — e todos os bindings dinâmicos que as usam em badges, seletores e `Cell fill` dos gráficos. Não normalize, sobrescreva ou persista novas cores sobre dados do usuário.

### 9.3 Tipografia offline

Remova a importação remota de Roboto existente em `src/main.css`. Não adicione outra importação de fonte.

Use uma pilha de sistema semelhante a:

```css
ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Use peso, tamanho e espaçamento para diferenciar títulos e corpo. Valores financeiros devem usar números tabulares (`font-variant-numeric: tabular-nums`) para facilitar comparação.

Escala sugerida:

- texto auxiliar: 12px;
- texto secundário: 14px;
- corpo e controles: 16px;
- título de card: 18px;
- título de página: 24–32px responsivo;
- KPI principal: 32–52px responsivo.

Evite textos funcionais abaixo de 12px.

### 9.4 Espaçamento, raios e profundidade

- grade de espaçamento: 4, 8, 12, 16, 20, 24, 32, 40 e 48px;
- raios pequenos: 10px;
- controles e cards comuns: 14px;
- painéis de destaque: 20px;
- pills/badges: raio total;
- sombras discretas sobre fundo escuro;
- bordas sutis para separar superfícies;
- blur entre 10 e 16px somente quando houver transparência e legibilidade suficiente.

Nem todo card é clicável. Aplique cursor e hover de elevação somente quando o componente realmente tiver uma ação.

### 9.5 Controles e componentes

- Botões e campos devem ter altura mínima de 44px quando forem alvos principais de toque.
- Botão primário: azul forte, texto branco e foco claramente visível.
- Botão de sucesso: verde escuro, texto branco.
- Botão secundário/ghost: superfície ou transparência com borda visível.
- Botão destrutivo: vermelho, reservado a ações destrutivas.
- Disabled deve ser distinguível sem parecer interativo.
- Inputs, selects e textareas devem ter label, estado de foco, erro e disabled claros.
- Cards de métricas devem alinhar números e preservar leitura em valores longos.
- Badges devem ter texto além de cor.
- Toasts, alerts, dialogs, sheets e tooltips devem manter o comportamento Radix atual.
- Progressos devem possuir valor ou descrição textual acessível.
- Tabelas precisam de cabeçalhos, hover discreto, números alinhados e alternativa responsiva.
- Estados vazios devem explicar o próximo passo usando uma ação já existente.
- Loading não deve deslocar bruscamente o layout.

### 9.6 Gráficos financeiros

- Continue usando Recharts.
- Preserve datasets, cálculos, handlers e tooltips atuais.
- Use azul para interação ou série neutra, verde para receita/sucesso e rosa para despesa agregada. Não recolora divisões por classe, categoria ou item que recebam cor dinâmica dos dados.
- Eixos e grades devem ser legíveis sobre fundo escuro.
- Tooltips devem ter superfície escura, borda e contraste adequados.
- Não dependa somente de cor: mantenha legenda, rótulo e tooltip.
- Não anime números de forma que atrase ou altere o valor correto.
- Respeite `prefers-reduced-motion`.
- Mantenha altura explícita no contêiner pai de cada `ResponsiveContainer`, evitando gráficos com altura zero após a mudança de layout.

## 10. Composição e responsividade

### Desktop — 1024px ou mais

- Manter sidebar e conteúdo principal.
- Sidebar com largura próxima da estrutura atual, sem reduzir o espaço útil de tabelas e gráficos.
- Conteúdo com largura máxima coerente, centralizado e com grids responsivos.
- KPIs podem ficar em grade, mas devem quebrar antes de comprimir números.

### Tablet — 640px a 1023px

- Manter o drawer/menu existente.
- Reduzir grids para duas ou uma coluna conforme conteúdo.
- Evitar ações espremidas; permitir quebra controlada da barra de filtros.

### Celular — abaixo de 640px

- Manter exatamente as cinco destinações atuais da navegação inferior; as demais rotas continuam acessíveis pelo drawer/menu existente.
- Garantir espaço inferior para que nenhum conteúdo fique atrás da navegação fixa.
- Empilhar cards e painéis.
- Exibir filtros de forma utilizável, sem esconder recursos.
- Converter tabelas extensas em cards ou permitir scroll apenas no contêiner da tabela.
- Alvos de toque com pelo menos 44 × 44px.
- Nenhum scroll horizontal na página.

Teste ao menos em 320, 375, 390, 768, 1024 e 1440px. O zoom de 200% deve continuar utilizável.

## 11. Acessibilidade obrigatória

- Contraste WCAG AA: pelo menos 4,5:1 para texto normal e 3:1 para texto grande e elementos gráficos essenciais.
- Foco visível em todos os controles interativos.
- Ordem de tabulação lógica.
- Labels ou nomes acessíveis em botões somente com ícone.
- `aria-current` na navegação ativa quando já utilizado.
- Estados expandidos, selecionados, pressionados e inválidos comunicados corretamente.
- Não remover semântica de tabela, formulário, dialog, sheet, alert ou heading.
- Não comunicar receita, despesa, pendência, sucesso ou erro somente por cor.
- Respeitar `prefers-reduced-motion`.
- Garantir leitura de valores, sinais e datas por tecnologias assistivas.
- Preservar idioma `pt-BR` e formatação monetária `R$ 1.234,56`.

## 12. Uso das imagens anexadas

As imagens anexadas são **referências de composição, ritmo visual, densidade, cards, navegação e paleta**. Todos os nomes, saldos, datas, lançamentos, metas, percentuais e demais números nelas são fictícios.

Não copie dados das imagens para o aplicativo. Não implemente, a partir delas, Metas, uma nova tela/rota de Relatórios, uma nova tela/rota de gestão de contas ou cartões, avatar, perfil, busca, notificações, botão de ocultar saldo ou toggle de tema. Preserve integralmente as entidades, os campos e os seletores de conta/cartão já existentes nos lançamentos. A geração de PDF já existente em Configurações deve ser preservada. Adapte somente a linguagem visual aos recursos reais enumerados neste documento.

Se existir imagem de tema claro entre os materiais disponíveis, ignore-a nesta rodada.

## 13. Estratégia de implementação

Execute na seguinte ordem, sem parar entre as etapas:

1. Leia o código atual, este documento e as imagens.
2. Confirme internamente o inventário de rotas e os limites protegidos.
3. Atualize somente `lang`, título e metadados textuais autorizados em `index.html`, preservando literalmente os scripts/comentários protegidos.
4. Defina os tokens escuros no formato HSL exigido e a pilha de fonte offline em `src/main.css`, preservando regras obrigatórias existentes.
5. Reestilize o layout global e as navegações sem alterar destinos ou eventos.
6. Reestilize os componentes compartilhados autorizados.
7. Reestilize cada rota real, incluindo todos os seus estados e modais.
8. Faça uma varredura por classes hard-coded de tema claro nas áreas autorizadas e converta-as conscientemente; não tente resolver tudo com um override global frágil.
9. Verifique textos longos, valores altos, listas vazias, mensagens de erro, disabled, loading, dialogs e menus.
10. Revise responsividade e acessibilidade.
11. Confira que nenhum arquivo protegido foi modificado.
12. Rode lint, testes, build e checagem de formatação.
13. Corrija todas as regressões introduzidas pela reestilização e repita os comandos necessários.

Não faça uma simples cópia do HTML/CSS do protótipo. Reaproveite a composição visual dentro dos componentes React existentes e mantenha todos os dados dinâmicos.

## 14. Verificação funcional por fluxo

Valide, sem apagar dados reais:

- abertura de todas as rotas;
- onboarding condicional;
- mudança mensal/anual e seletores;
- navegação e badges;
- abertura e fechamento do novo lançamento;
- filtros e query string de Transações;
- seleção e ações em lote;
- edição, confirmações que já existirem e exclusão pelas ações atuais;
- upload, mapeamento, prévia e resultado de importação usando somente fixture segura quando disponível;
- CRUD de orçamento e seus alertas;
- CRUD de categorias;
- expansão, busca e CRUD da hierarquia;
- CRUD, ativação, prioridade e testes de regras;
- controles de configurações;
- geração de CSV, XLSX e PDF em ambiente seguro;
- backup e restauração somente com dados de teste;
- confirmação da zona destrutiva sem executar reset sobre dados que precisem ser preservados;
- rota 404 e retorno.

## 15. Comandos de qualidade

Rode, no mínimo:

```bash
npm run lint
npm run test
npm run build
npm run format:check
```

Se algum comando já falhar antes das alterações, diferencie claramente problema preexistente de regressão nova. Corrija todas as regressões causadas por esta tarefa. Não use `lint:fix` ou formatação em massa se isso tocar arquivos fora do escopo visual.

Faça também inspeção visual nos breakpoints definidos. Não declare uma resolução validada sem realmente verificá-la.

## 16. Critérios de aceite

O trabalho só está concluído quando todos os itens abaixo forem verdadeiros:

- [ ] Todas as rotas reais foram reestilizadas.
- [ ] Todos os passos do onboarding e da importação foram contemplados.
- [ ] Layout desktop, drawer tablet e navegação inferior mobile continuam funcionais.
- [ ] Visões mensal e anual continuam corretas.
- [ ] Filtros, seleções, dialogs, CRUDs, exportações e backups continuam conectados.
- [ ] Nenhuma rota ou funcionalidade nova foi criada.
- [ ] Nenhum dado fictício das imagens foi incluído no produto.
- [ ] A marca exibida é “Orçamento Pessoal” e nenhum logo SKIP foi adicionado.
- [ ] `index.html` usa `lang="pt-BR"`, título/metadados do Orçamento Pessoal e mantém intactos os scripts/comentários `@skip-protected`.
- [ ] A página 404 está em `pt-BR`, mantendo o log de diagnóstico e o destino `/`.
- [ ] O aplicativo usa somente tema escuro e não possui toggle de tema.
- [ ] Não há importação remota de fontes.
- [ ] Não foi adicionada dependência.
- [ ] Nenhum arquivo coberto por `preventAI` foi modificado.
- [ ] Nenhum arquivo em `src/components/ui/**` foi modificado.
- [ ] Nenhuma regra de negócio, contrato, ID, cálculo ou persistência foi alterada.
- [ ] Tokens consumidos por `hsl(var(--…))` contêm componentes HSL válidos, e cores dinâmicas do catálogo/usuário foram preservadas.
- [ ] Não há scroll horizontal acidental na página.
- [ ] Navegação por teclado, foco e contraste atendem aos requisitos.
- [ ] Lint, testes, build e format check foram executados e seus resultados registrados.
- [ ] Não restaram TODOs, placeholders ou etapas descritas apenas como trabalho futuro.

## 17. Relatório final obrigatório

Ao terminar, responda com:

1. resumo objetivo do resultado;
2. lista completa de arquivos criados e modificados;
3. rotas verificadas;
4. decisões visuais aplicadas;
5. confirmação de que `preventAI`, `src/components/ui/**`, módulos de negócio e rotas permaneceram intactos;
6. comandos executados, resultado e contagem dos testes;
7. breakpoints e fluxos verificados manualmente;
8. eventuais limitações reais do ambiente.

Não apresente como “concluído” se alguma rota, estado obrigatório ou teste tiver ficado pendente. Se houver um bloqueio técnico real da plataforma, explique exatamente qual operação falhou, em qual arquivo/comando e o que falta; não substitua execução por uma lista genérica de próximos passos.
