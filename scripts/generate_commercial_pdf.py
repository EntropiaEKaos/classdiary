from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from pathlib import Path

OUT = Path("docs/ClassDiary_Documentacao_Comercial.pdf")
OUT.parent.mkdir(parents=True, exist_ok=True)

BLUE = colors.HexColor("#17365D")
BLUE2 = colors.HexColor("#2F5597")
LIGHT = colors.HexColor("#EAF0F8")
LIGHT2 = colors.HexColor("#F4F7FB")
DARK = colors.HexColor("#1F2937")
GREEN = colors.HexColor("#1F7A4D")
GRAY = colors.HexColor("#6B7280")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CDTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=27, leading=31, textColor=BLUE, alignment=TA_CENTER, spaceAfter=8))
styles.add(ParagraphStyle(name="CDSubtitle", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=BLUE2, alignment=TA_CENTER, spaceAfter=9))
styles.add(ParagraphStyle(name="CDLead", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=14, textColor=GRAY, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=BLUE, spaceBefore=6, spaceAfter=8))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=BLUE2, spaceBefore=6, spaceAfter=5))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=12.4, textColor=DARK, spaceAfter=5))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.6, leading=9.5, textColor=GRAY))
styles.add(ParagraphStyle(name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=WHITE))
styles.add(ParagraphStyle(name="TableCell", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.2, leading=9.1, textColor=DARK))
styles.add(ParagraphStyle(name="TableCellBold", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=7.2, leading=9.1, textColor=DARK))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.7, leading=12, textColor=DARK))
styles.add(ParagraphStyle(name="Bulletx", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.9, leading=11.8, leftIndent=12, firstLineIndent=-7, bulletIndent=4, spaceAfter=2.5))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D1D5DB"))
    canvas.setLineWidth(0.4)
    canvas.line(18*mm, 12*mm, 192*mm, 12*mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRAY)
    canvas.drawString(18*mm, 7.5*mm, "ClassDiary - Documentação Comercial e Funcional")
    canvas.drawRightString(192*mm, 7.5*mm, str(doc.page))
    canvas.restoreState()

def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])

def bullets(items):
    return [P("• " + x, "Bulletx") for x in items]

def module_table(title, rows):
    flow = [P(title, "H2x")]
    data = [[P("Módulo / Recurso", "TableHead"), P("O que já funciona", "TableHead")]]
    for a, b in rows:
        data.append([P(a, "TableCellBold"), P(b, "TableCell")])
    t = Table(data, colWidths=[54*mm, 118*mm], repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), BLUE),
        ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#C9D2DF")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 3.5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3.5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT2]),
    ]))
    return flow + [t, Spacer(1, 4*mm)]

story = [
    Spacer(1, 44*mm),
    P("ClassDiary", "CDTitle"),
    P("Plataforma SaaS de Diário de Classe e Gestão Escolar", "CDSubtitle"),
    P("Documentação comercial das funcionalidades implementadas e certificadas no repositório", "CDLead"),
    Spacer(1, 9*mm),
]

kpis=[]
for v,l in [("97","páginas de aplicação"),("9","APIs especializadas"),("50+","módulos/telas administrativas"),("CI","build de produção verde")]:
    kpis.append(P(f'<font size="16" color="#2F5597"><b>{v}</b></font><br/><font size="7.2">{l}</font>', "CDLead"))
kpi=Table([kpis], colWidths=[43*mm]*4, hAlign="CENTER")
kpi.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),LIGHT),
    ("BOX",(0,0),(-1,-1),0.4,colors.HexColor("#D7E2F1")),
    ("INNERGRID",(0,0),(-1,-1),0.35,WHITE),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),9),
    ("BOTTOMPADDING",(0,0),(-1,-1),9),
]))
story += [
    kpi, Spacer(1,9*mm),
    P('Versão comercial baseada no HEAD certificado: <b>2b3eebd2bf32e3b0dd0c773160aaa317dead57a3</b>', "Smallx"),
    Spacer(1,2*mm),
    P('<font color="#1F7A4D"><b>Status técnico:</b> Prisma + PostgreSQL + Seed + Typecheck + Lint + Production Build aprovados no mesmo SHA.</font>', "Smallx"),
    PageBreak(),
]

story += [
    P("1. Visão geral da solução", "H1x"),
    P("O ClassDiary é uma plataforma SaaS multi-tenant para escolas, cursos e redes de ensino. O sistema centraliza gestão acadêmica, secretaria, comunicação, financeiro, avaliações, operação escolar, recursos humanos, patrimônio, estoque, transporte, cantina e acompanhamento pedagógico em uma única aplicação web."),
    P("A arquitetura foi construída para atender múltiplas instituições com isolamento por organização, usuários e papéis, permissões por módulo, portais específicos e trilhas de auditoria. O produto já possui uma base funcional extensa e um ciclo de CI que valida banco, schema, tipagem, lint e build de produção."),
]
call=Table([[P('<b><font color="#1F7A4D">Proposta de valor para venda</font></b><br/>Uma escola pode operar matrícula, rotina pedagógica, provas, comunicação, cobrança, relatórios e diversos serviços internos sem depender de sistemas fragmentados.', "Callout")]], colWidths=[172*mm])
call.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#E9F7EF")),
    ("BOX",(0,0),(-1,-1),0.4,colors.HexColor("#B7DFC7")),
    ("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),
    ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
]))
story += [Spacer(1,3*mm), call, Spacer(1,4*mm), P("Públicos atendidos","H2x")]
story += bullets(["Direção e mantenedores","Coordenação pedagógica","Secretaria escolar","Professores","Alunos","Pais e responsáveis","Financeiro e administrativo","RH e equipes operacionais"])
story += [
    P("Perfis e acesso","H2x"),
    P("A aplicação diferencia acesso por papéis e por permissões de módulo. Entre os papéis previstos estão administração escolar, coordenação, secretaria, professores, alunos, responsáveis e proprietário da plataforma. O menu e as mutações são protegidos conforme o escopo autorizado."),
    PageBreak(),
]

story += module_table("2. Núcleo acadêmico e secretaria", [
("Alunos e cadastro completo","Cadastro de aluno, matrícula, ficha completa, dados pessoais, endereço, contatos, responsável, emergência, saúde e histórico administrativo."),
("Turmas e matrículas","Criação de turmas, vínculo ao ano letivo, matrícula, rematrícula, transferência entre turmas e histórico de movimentações."),
("Importação de alunos","Importação em lote por CSV para acelerar entrada de bases existentes."),
("Professores e disciplinas","Cadastro/vínculo de professores, disciplinas, associação disciplina-turma e validação de professor responsável."),
("Horários","Grade de horários com validação de conflito por turma e professor."),
("Diário de classe","Registro de aulas, conteúdo, professor, turma e integração com frequência."),
("Frequência","Chamada por aula, status de presença/falta/atraso/justificado e acompanhamento institucional."),
("Justificativa de faltas","Aluno/responsável pode justificar ausência; equipe autorizada revisa e aprova/rejeita, com notificação e auditoria."),
("Notas e médias","Lançamento de notas ponderadas, valor máximo, peso, período acadêmico, turma e ano letivo."),
("Revisão de nota","Aluno/responsável solicita revisão; professor responsável ou coordenação analisa; impede duplicidade pendente."),
("Recuperação","Registro de recuperação com proveniência de ano/período/turma e integração com resultados."),
("Fechamento de período","Bloqueio acadêmico por período e registro de quem realizou o fechamento."),
("Operação acadêmica","Painel de prontidão por turma/disciplina com aulas, cobertura de frequência, alunos sem nota, revisões/justificativas pendentes e notificação direta ao professor."),
("Risco acadêmico","Detecção de alunos abaixo da média ou frequência mínima, classificação de risco, abertura de intervenção e notificação do responsável."),
("Fechamento anual","Checklist de períodos fechados, progresso de resultados, promovidos/retidos e recálculo anual em lote."),
("Resultados anuais","Cálculo de resultado anual com média e frequência, segregado por ano letivo."),
("Boletins","Boletim individual em PDF e geração em lote, com escopo por ano letivo e autorização por perfil."),
("Conselho de classe","Registro de decisões do conselho vinculadas a aluno, ano, período e autor."),
("Histórico e documentos","Histórico escolar, documentos acadêmicos, templates de documentos e geração PDF."),
("Checklist documental","Controle de documentos obrigatórios por aluno: pendente, recebido ou dispensado, com arquivo e observação."),
])
story += [PageBreak()]

story += module_table("3. Portais, comunicação e relacionamento", [
("Portal do professor","Acesso dedicado à rotina docente, aulas, turmas, avaliações e atividades dentro do escopo do professor."),
("Portal do aluno","Notas, frequência, atividades, provas e fluxos acadêmicos vinculados ao próprio aluno."),
("Portal da família","Responsável acessa alunos vinculados, justificativas, contratos, informações acadêmicas e financeiras autorizadas."),
("Agenda personalizada","Agenda baseada na turma do aluno, horários, atividades e compromissos acadêmicos."),
("Mensagens internas","Conversas entre usuários da mesma instituição, resposta em thread e controle de leitura."),
("Notificações","Central de notificações para eventos do sistema, mensagens, cobranças e automações."),
("Comunicados","Publicação institucional segmentada por público: todos, equipe, alunos ou responsáveis."),
("Calendário acadêmico","Eventos acadêmicos com data, descrição e público-alvo."),
("Ocorrências","Registro disciplinar/administrativo do aluno com severidade, autoria, vínculo docente e auditoria."),
("Pré-inscrição pública","Página pública de interesse/matrícula por escola, com proteção contra spam e limitação de tentativas."),
("CRM de captação","Leads de matrícula, status, interações, telefone/e-mail/reunião, follow-up e conversão em aluno."),
("Convites de acesso","Convites de uso único com expiração para professores, alunos e responsáveis vinculados."),
])
story += module_table("4. Financeiro escolar", [
("Configurações financeiras","Razão social/documento, chave Pix, dia padrão de vencimento, multa, juros e prefixo de recibo."),
("Contratos escolares","Contrato por aluno, mensalidade, bolsa/desconto, vigência e aceite eletrônico pelo responsável vinculado."),
("Cobranças","Geração de mensalidade individual e em lote com referência, vencimento, desconto e situação da cobrança."),
("Pagamentos","Registro de pagamento por Pix, dinheiro, cartão, transferência ou outro meio; suporta pagamento parcial."),
("Recibos","Recibo PDF com número único, aluno, descrição, valor, forma de pagamento e dados da instituição."),
("Inadimplência","Aplicação de multa e juros em cobranças vencidas e acompanhamento de status OPEN/PARTIAL/OVERDUE/PAID."),
("DRE administrativo","Centros de custo, despesas, receitas, vencimento/recebimento e visão gerencial."),
("Automação de cobrança","Regras antes/depois do vencimento, mensagem parametrizada e notificação in-app para responsáveis."),
("Relatórios financeiros","Visão de recebimentos, despesas, atrasos e indicadores agregados."),
])
story += [PageBreak()]

story += module_table("5. Avaliações, provas online e inteligência pedagógica", [
("Banco de questões","Questões por disciplina, competência, dificuldade, tipo, alternativas, gabarito, tags e pontuação."),
("Importação de questões","Carga em lote por CSV para banco de questões."),
("Provas online","Criação de prova por turma/disciplina/período, questões ordenadas, publicação e tentativa do aluno."),
("Blueprints de prova","Modelos de geração de prova com critérios e composição planejada."),
("Geração por competência","Montagem de prova com base em competência/habilidade."),
("Questões objetivas e discursivas","Suporte a múltipla escolha, verdadeiro/falso, texto curto e dissertativa."),
("Correção","Correção automática quando aplicável e correção manual para respostas discursivas."),
("Rubricas","Criação de rubricas pedagógicas e aplicação com pontuação, feedback e detalhes estruturados."),
("Lançamento automático de nota","Resultado de prova pode ser integrado ao registro de notas do aluno."),
("Segunda chamada","Autorização extra de tentativa para casos específicos."),
("Recuperação de prova","Fluxo de recuperação com caso elegível, nova prova e acompanhamento."),
("Revisão de prova","Solicitação do aluno/responsável e análise pela equipe autorizada."),
("Integridade","Registro de perda de foco, copy/paste e visibilidade durante tentativa, com indicador de integridade."),
("Análise por habilidade","Painéis para desempenho por competência/habilidade."),
("Evolução em avaliações","Acompanhamento histórico de desempenho em provas."),
("PDF de prova","Geração de prova em PDF com autorização e escopo do professor/turma."),
])
story += module_table("6. Gestão pedagógica avançada", [
("Currículo","Estruturas curriculares, versões e organização institucional."),
("Competências","Competências/habilidades vinculáveis a avaliações e acompanhamento."),
("Matriz curricular","Matriz com disciplinas e organização por currículo."),
("Planos de aula","Planejamento por turma, disciplina e professor."),
("Intervenções pedagógicas","Registro e acompanhamento de intervenções por aluno/turma."),
("Avaliação por competência","Registro específico de evolução em competências."),
("Observações pedagógicas","Registros qualitativos para acompanhamento do estudante."),
("Metas","Metas por escola, turma ou professor, com métricas como notas, frequência, aulas e entregas."),
("Qualidade e pesquisas","Pesquisas NPS/satisfação/customizadas, com público-alvo e respostas limitadas por usuário."),
("Evolução do aluno","Visão consolidada do desenvolvimento acadêmico e pedagógico."),
])
story += [PageBreak()]

story += module_table("7. Operação escolar integrada", [
("RH","Cadastro de colaboradores, cargo, departamento, contratação, salário e registro de ponto."),
("Patrimônio","Cadastro de bens, etiqueta, categoria, série, localização e valor de aquisição."),
("Estoque","Itens, SKU, quantidade, estoque mínimo, custo médio e movimentos de entrada/saída/ajuste."),
("Biblioteca","Acervo, quantidade de exemplares, empréstimo, devolução, disponibilidade e vencimento."),
("Transporte","Rotas, motorista, veículo, capacidade e alunos vinculados."),
("Cantina","Produtos, preço, estoque e venda associada ou não a aluno, com baixa transacional de estoque."),
("Enfermaria","Registro de atendimento, resumo, detalhes, providências e aviso a responsável."),
("Autorizações","Autorizações vinculadas a aluno, com aceite/rejeição pelo responsável."),
("Recursos","Salas/equipamentos/recursos reserváveis com capacidade e localização."),
("Reservas","Agenda de recursos com bloqueio de conflito de horário."),
("Manutenção","Planos preventivos, vencimentos, chamados, prioridade e encerramento."),
("Fornecedores e compras","Cadastro de fornecedores, pedidos de compra, valor e fluxo DRAFT/ORDERED/RECEIVED/CANCELED."),
("Automações","Regras operacionais para manutenção próxima, estoque baixo e autorizações pendentes."),
])
story += module_table("8. Gestão, BI, auditoria e SaaS", [
("Visão executiva","KPIs acadêmicos, financeiros e operacionais em uma página consolidada, incluindo progresso de fechamento anual."),
("BI executivo","Exportação de indicadores em CSV para análise externa."),
("Relatórios acadêmicos","Relatórios detalhados, evolução, frequência, notas e histórico."),
("Auditoria","Registro de ações críticas com usuário, organização, entidade, ação e metadados."),
("Permissões por módulo","Override por usuário/membership para visualizar, criar, alterar ou excluir por módulo."),
("Multi-escola","Usuário pode pertencer a mais de uma instituição e trocar a organização ativa com validação de membership."),
("Super Admin SaaS","Gestão de instituições, planos, assentos e bloqueio/desbloqueio pelo proprietário da plataforma."),
("Planos comerciais","Estrutura de planos Starter, Pro e Enterprise."),
("Assistente administrativo","Consultas institucionais estruturadas para visão de financeiro, acadêmico, CRM e panorama geral."),
("Arquivos","Registro de ativos/arquivos com limites, HTTPS em produção e validação de entidade da própria escola."),
])
story += [PageBreak()]

story += [P("9. Segurança, isolamento e confiabilidade","H1x")]
sec_rows=[
("Multi-tenant","Dados e operações são escopados por organizationId e pela escola ativa da sessão."),
("RBAC e permissões","Papéis institucionais + permissões por módulo + validação de objeto para reduzir IDOR."),
("Sessões","Sessões persistidas em banco, token armazenado por hash, cookie HttpOnly, SameSite e Secure em produção."),
("Senhas","Hash com bcrypt cost 12."),
("Rate limit","Login possui limitação por IP/e-mail; pré-inscrição pública possui proteção de volume."),
("Origem de mutações","Mutações sensíveis verificam origem/host e contexto de sessão."),
("Auditoria","Mutações críticas registram trilha de auditoria."),
("Headers","Headers defensivos, CSP e HSTS configurados para ambiente de produção."),
("Documentos sensíveis","PDFs e CSVs sensíveis usam cache private/no-store e autorização específica."),
("Concorrência financeira/estoque","Pagamentos, estoque, biblioteca e cantina usam transações serializáveis em fluxos críticos."),
("Bootstrap","Criação inicial do proprietário da plataforma protegida por token, origem e comparação em tempo constante."),
("Migração de produção","Comando de migrate deploy bloqueado enquanto não existir baseline Prisma real e validada."),
]
data=[[P("Controle","TableHead"),P("Implementação","TableHead")]]+[[P(a,"TableCellBold"),P(b,"TableCell")] for a,b in sec_rows]
t=Table(data,colWidths=[54*mm,118*mm],repeatRows=1)
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),BLUE),("GRID",(0,0),(-1,-1),0.35,colors.HexColor("#C9D2DF")),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,LIGHT2]),("VALIGN",(0,0),(-1,-1),"TOP"),
    ("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),
    ("TOPPADDING",(0,0),(-1,-1),3.5),("BOTTOMPADDING",(0,0),(-1,-1),3.5),
]))
story += [
    t,Spacer(1,4*mm),
    P("Healthcheck e readiness","H2x"),
    P("A API /api/health verifica conexão com PostgreSQL, retorna status operacional, latência e sinaliza indisponibilidade com HTTP 503. Isso permite integração com monitoramento e gates de promoção."),
    P("10. Certificação técnica atual","H1x"),
    P("O corte descrito neste documento foi validado no mesmo commit da branch main:"),
    P('<b><font size="13" color="#2F5597">2b3eebd2bf32e3b0dd0c773160aaa317dead57a3</font></b>',"Bodyx"),
]
cert=[("Instalação de dependências","APROVADO"),("Prisma generate","APROVADO"),("Prisma validate","APROVADO"),("PostgreSQL / db:push","APROVADO"),("Seed CI","APROVADO"),("Typecheck","APROVADO"),("Lint","APROVADO"),("Production build","APROVADO")]
ct=Table([[P(a,"TableCell"),P(f'<font color="#1F7A4D"><b>{b}</b></font>',"TableCell")] for a,b in cert],colWidths=[100*mm,72*mm])
ct.setStyle(TableStyle([
    ("GRID",(0,0),(-1,-1),0.35,colors.HexColor("#C9D2DF")),
    ("BACKGROUND",(1,0),(1,-1),colors.HexColor("#E9F7EF")),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
]))
story += [
    ct,Spacer(1,3*mm),
    P("Workflow certificado: <b>ClassDiary CI #36651094108</b>. O run foi concluído com status success e head SHA idêntico ao HEAD da main no momento da certificação."),
    P("Stack tecnológica","H2x"),
]
story += bullets(["Next.js 16.3.6","React 19.2","TypeScript 5.9","PostgreSQL 16 no CI","Prisma ORM 7.10 + adapter-pg","Node.js 22","pdf-lib para documentos e relatórios em PDF","Zod para validação de entrada","bcryptjs para credenciais"])
story += [PageBreak()]

story += [P("11. Argumentos comerciais para apresentação","H1x")]
for title,body in [
("Centralização","Substitui planilhas, sistemas isolados e controles manuais por uma plataforma única."),
("Visão 360°","Direção acompanha acadêmico, financeiro e operação escolar no mesmo ambiente."),
("Experiência por perfil","Professor, aluno, família, secretaria e gestão recebem interfaces e permissões adequadas ao papel."),
("Escalabilidade SaaS","Multi-tenant, planos comerciais e super admin permitem comercialização para múltiplas instituições."),
("Automação","Cobrança, notificações, manutenção, estoque e processos acadêmicos reduzem trabalho repetitivo."),
("Rastreabilidade","Auditoria e histórico de movimentações aumentam controle administrativo."),
("Base pedagógica forte","Currículo, competências, rubricas, provas online, análise por habilidade e intervenções ampliam o produto além do diário de classe."),
("Operação completa","RH, estoque, biblioteca, transporte, cantina, enfermaria, compras e manutenção reduzem dependência de ferramentas externas."),
]:
    story.append(P(f'<b><font color="#2F5597">{title}:</font></b> {body}'))
story += [P("Exemplos de clientes potenciais","H2x")]
story += bullets(["Escolas privadas de educação básica","Cursos livres e profissionalizantes","Redes pequenas e médias de ensino","Escolas de idiomas","Instituições que hoje operam com planilhas e múltiplos sistemas","Projetos educacionais que precisam de portal de aluno/família e provas online"])
story += [
    P("Modelo de comercialização sugerido","H2x"),
    P("O produto já possui estrutura conceitual para Starter, Pro e Enterprise. Comercialmente, a precificação pode ser organizada por número de alunos/assentos, módulos habilitados, implantação, suporte e serviços adicionais. A cobrança recorrente automatizada da assinatura SaaS ainda depende da integração com um gateway real antes da liberação de produção."),
    PageBreak(),
]

story += [P('12. O que ainda não deve ser prometido como “produção liberada”',"H1x")]
warning=Table([[P('<b><font color="#C65D1E">Transparência comercial</font></b><br/>A base funcional e o build de produção estão certificados. Entretanto, o projeto ainda não foi promovido para ambiente produtivo final.',"Callout")]],colWidths=[172*mm])
warning.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#FFF3E8")),
    ("BOX",(0,0),(-1,-1),0.4,colors.HexColor("#F0C9A8")),
    ("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),
    ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
]))
story += [warning,Spacer(1,3*mm)]
story += bullets([
    "Criar e validar a baseline versionada de prisma/migrations.",
    "Aplicar a baseline em staging e certificar migrate deploy.",
    "Configurar banco definitivo, backups e observabilidade.",
    "Executar testes E2E dos fluxos críticos.",
    "Revisar LGPD, retenção e política de privacidade antes de operação com dados reais.",
    "Integrar cobrança recorrente do próprio SaaS a um gateway real.",
    "Criar e validar preview Vercel antes de qualquer promoção para produção.",
])
story += [
    P("Conclusão","H1x"),
    P("O ClassDiary já ultrapassou o estágio de um simples diário de classe. A aplicação funciona como uma suíte de gestão escolar completa, com um núcleo acadêmico robusto, secretaria, financeiro, comunicação, provas online, inteligência pedagógica, BI e módulos operacionais. O repositório atual demonstra uma base comercialmente apresentável e tecnicamente validada em CI, pronta para avançar para staging, testes E2E e preparação de implantação."),
    Spacer(1,8*mm),
    P('<font size="15" color="#17365D"><b>ClassDiary</b></font>',"CDLead"),
    P("Gestão escolar integrada, do diário de classe à operação completa.","CDLead"),
]

doc = SimpleDocTemplate(
    str(OUT), pagesize=A4,
    rightMargin=18*mm, leftMargin=18*mm, topMargin=17*mm, bottomMargin=18*mm,
    title="ClassDiary - Documentação Comercial e Funcional",
    author="ClassDiary",
)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
