# Validação final do LIVE CUTTER

**Data da auditoria:** 2026-11-22  
**Versão avaliada:** 0.1.0 (Unreleased)  
**Ambiente:** Windows 10 Pro, build 10.0.26300; Node.js 24.22.1; npm 11.19.1.  
**Escopo:** build local Windows x64; nenhuma publicação remota.

## Resumo de resultados

| Verificação | Resultado | Evidência |
|---|---|---|
| Testes automatizados locais | **Aprovado** | `npm test`: 51 testes passaram após a correção da regressão no próprio teste. Os dois testes de integração ficam opt-in e são registrados separadamente abaixo. |
| TypeScript | **Aprovado** | `npm run typecheck` passou. |
| Build Vite/Electron | **Aprovado** | `npm run build` passou depois das correções de MP4, CSP e IPC. |
| Cortes reais autorizados | **Aprovado nos cenários executados** | Quatro cortes em Big Buck Bunny e um cancelamento real; detalhes abaixo. |
| Auditoria de produção | **Aprovado** | `npm audit --omit=dev`: 0 vulnerabilidades. |
| Auditoria completa | **Com achados** | 6 vulnerabilidades moderadas de dependências de build, relacionadas a minimatch/electron-builder; nenhuma alta ou crítica. O npm propõe downgrade major do electron-builder como correção automática. O downgrade/override não foi aplicado por risco de incompatibilidade. |
| Assinatura Authenticode | **Não assinado** | `Get-AuthenticodeSignature` retornou `NotSigned`. |
| UI interativa / máquina limpa | **Não testado** | Não há VM limpa disponível. Uma tentativa anterior de abrir o instalador foi bloqueada pelo Controle de Aplicativos do Windows. |
| Atualização entre versões | **Bloqueado por infraestrutura externa** | Sem remote/feed GitHub e sem certificado Authenticode. O estado correto continua `NOT CONFIGURED`. |

## Testes automatizados

`npm test` cobre validação de URL e intervalo, argumentos fixos do yt-dlp, parsing de progresso, timeout e cancelamento de subprocesso, validação/conversão FFmpeg/FFprobe, configurações e histórico persistentes, gerenciamento seguro de arquivos, IPC confiável, navegação, versão e estados do atualizador.

Também foram adicionados testes para:

- Rejeitar MOV QuickTime como MP4 e remuxar MOV H.264/AAC para MP4 real.
- Bloquear navegação fora do documento empacotado e navegação por frames filhos.
- Bloquear IPC vindo de frame diferente do frame principal.
- Registrar erros quando yt-dlp, FFmpeg ou FFprobe estão ausentes, sem criar saída.

## Integração de cortes reais

A fonte foi o Big Buck Bunny publicado pelo canal verificado Blender. A Blender Foundation licencia o projeto sob CC BY 3.0 ([vídeo](https://www.youtube.com/watch?v=YE7VzlLtp-4), [licença do projeto](https://peach.blender.org/about/)). Os testes foram feitos em sequência com o yt-dlp e os binários FFmpeg/FFprobe incluídos no repositório.

| Intervalo | Resultado final | Tempo observado |
|---|---|---:|
| 00:00:00–00:00:30 | MP4, H.264/AAC, 1920×1080, 20.535.714 bytes | 30,85 s |
| 00:02:00–00:04:00 | MP4, H.264/AAC, 1920×1080, 80.100.736 bytes | 74,13 s |
| 00:07:27–00:07:57 | MP4, H.264/AAC, 1920×1080, 20.441.477 bytes | 25,69 s |
| 00:09:17–00:09:47 | MP4, H.264/AAC, 1920×1080, 14.721.379 bytes | 13,21 s |

Cada resultado passou pela validação FFprobe de contêiner, streams, codecs, resolução e duração dentro da tolerância implementada. A sequência de quatro cortes levou aproximadamente 149 s. O cancelamento real terminou em aproximadamente 7 s; o histórico ficou como `cancelled` e o diretório temporário do job não continha resíduos.

Os valores da tabela são **tamanhos dos arquivos de saída**, não bytes transferidos pela rede. O app não mede bytes de rede no fluxo atual. O corte de dois minutos gerou 80,1 MB, portanto não se deve afirmar que o volume transferido corresponde somente ao tamanho do intervalo. Segmentos, keyframes e estratégia do yt-dlp influenciam a quantidade transferida.

## Segurança revisada e correções

- `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true` permanecem ativos.
- O preload expõe métodos IPC específicos; handlers verificam a janela, o frame principal e os dados recebidos.
- Execução externa usa `spawn` com argumentos separados; URLs passam por validação HTTPS/YouTube e os downloads desabilitam cookies/configuração externa do yt-dlp.
- A navegação empacotada agora aceita somente o `index.html` do aplicativo e bloqueia navegação de frames filhos. Em desenvolvimento, limita-se à origem Vite configurada.
- O CSP de produção não autoriza conexões HTTP/WebSocket ao localhost. Vite injeta essa permissão somente no servidor de desenvolvimento.
- O MP4 é reconhecido por marca de contêiner, e fontes QuickTime MOV são remuxadas antes de receber extensão `.mp4`.
- Pasta de saída, histórico e configurações são validados; nomes duplicados não sobrescrevem arquivos existentes. O histórico não apaga mídia.
- yt-dlp, FFmpeg e FFprobe têm versões/origens e avisos de licença registrados em `vendor/`.

## Itens não validados

- Instalação, atalhos, abertura do executável empacotado, operação e desinstalação em VM Windows 10/11 limpa.
- Interação manual de todas as telas e responsividade visual em diferentes tamanhos de janela; esta revisão foi estática e o build de produção passou.
- Atualização real de uma instalação base para uma segunda versão.
- Fontes 720p, 4K ou superior, gravação/transmissão com mais de uma hora e arquivos sem áudio. O produto exige áudio e vídeo e o teste real cobriu uma fonte 1080p.
- Falta real de espaço, interrupção manual de rede no meio do download, desligamento forçado do processo e limpeza após crash abrupto. As falhas de rede, timeout, cancelamento e ferramentas ausentes têm cobertura automatizada; o cancelamento real também foi testado.
- Workflow do GitHub Actions: não há repositório Git nem remote configurado nesta cópia.

## Versão, distribuição e limitações

A versão permanece **0.1.0 (Unreleased)**; não há evidência suficiente para propor `1.0.0`. `npm run dist:win` valida versão e lockfile, roda os testes, compila e empacota NSIS x64 com `--publish never`. O processo não cria nem envia releases.

O instalador local é `release/LIVE-CUTTER-Setup-0.1.0-x64.exe`, sem assinatura Authenticode. SmartScreen pode avisar sobre editor/reputação. Atualizações continuam indisponíveis até configurar um repositório GitHub real, feed e publisher Authenticode confiável. Quem instalou a build anterior sem feed precisará instalar manualmente uma futura versão base habilitada.

Não publique este artefato como validado em máquina limpa ou pronto para distribuição pública. A distribuição local para revisão está tecnicamente construída; validação de instalação, assinatura, feed e os achados moderados de ferramentas de build permanecem pendentes.
