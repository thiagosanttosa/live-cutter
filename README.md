# LIVE CUTTER

Aplicativo desktop Windows para consultar metadados de videos e transmissoes encerradas do YouTube, extrair intervalos autorizados e salvar cortes MP4 locais. Respeite direitos autorais e os termos aplicaveis do YouTube.

## Tecnologias

Electron, React, TypeScript e Vite compoem o aplicativo. yt-dlp consulta e baixa os intervalos; FFmpeg faz conversoes e FFprobe valida os arquivos finais. O instalador Windows e gerado com electron-builder/NSIS.

## Requisitos

- Windows 10 ou 11 (x64).
- Node.js 22.12 ou superior e npm para desenvolvimento.
- yt-dlp e FFmpeg/FFprobe. Os binarios fixados em `vendor/` sao incluidos no instalador Windows.
- Conexao com a internet para consultar e baixar videos.

O pacote inclui yt-dlp 2026.10.26 e FFmpeg/FFprobe 9.0.2. Consulte os avisos de licenca e origem em `vendor/yt-dlp/` e `vendor/ffmpeg/` antes de redistribuir. Essas ferramentas nao sao atualizadas pelo aplicativo.

## Desenvolvimento

```powershell
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm start
```

`npm test` executa testes locais sem baixar videos. Os testes de integracao sao opt-in e podem transferir midia:

```powershell
$env:YTDLP_PATH = 'vendor/yt-dlp/yt-dlp.exe'
npm run test:integration

$env:YTDLP_PATH = 'vendor/yt-dlp/yt-dlp.exe'
$env:CLIP_INTEGRATION_URL = 'https://www.youtube.com/watch?v=YE7VzlLtp-4'
npm run test:clip-integration
```

Use no teste de corte somente uma URL cujo uso voce esteja autorizado a fazer.

## Cortes e dados locais

O processo principal valida URLs, intervalos e ferramentas, pede ao yt-dlp somente a secao selecionada e valida o MP4 final com FFprobe. Conversoes necessarias usam FFmpeg. O renderer nao recebe acesso direto a Node, filesystem ou processos do sistema. Um corte pode ser executado por vez e pode ser cancelado.

A pasta de saida, qualidade, padrao de nome e historico sao armazenados em `app.getPath('userData')`. Remover registros do historico nao apaga arquivos de midia. Os arquivos finais ficam na pasta de saida escolhida; arquivos temporarios de jobs sao removidos ao concluir, falhar ou cancelar.

## Distribuicao Windows

`npm run dist:win` valida a versao, roda `npm test`, faz typecheck/build e cria o instalador NSIS x64 em `release/`. Depois prepara documentos e checksum SHA-256. O comando usa `--publish never`: ele nunca cria ou envia uma GitHub Release. O instalador atual nao possui assinatura Authenticode.

O instalador e os documentos gerados ficam em `release/` e `release/documentacao-de-distribuicao/`. O desinstalador preserva preferencias e historico do usuario. A documentacao de instalacao e operacao esta em `docs/DISTRIBUICAO-WINDOWS.md`.

## Versoes e atualizacoes

Versoes seguem SemVer e sao definidas em `package.json`; `CHANGELOG.md` e validado por `npm run version:check`. O workflow Windows gera um artefato para revisao e nao publica releases. Atualizacoes pelo app permanecem desativadas ate configurar um repositorio GitHub real e assinatura Authenticode. O updater exige verificacao de assinatura e requer uma instalacao base preparada para atualizacao.

Consulte `docs/ATUALIZACOES.md` para configuracao, validacao e limites do atualizador. Nao coloque certificados, senhas ou tokens no repositorio.

## Limitacoes conhecidas

O feed de atualizacao e assinatura Authenticode ainda nao estao configurados. Atualizacao entre versoes, abertura do app em uma VM Windows limpa e interacao manual da interface nao foram validadas. Os testes reais de corte cobrem quatro intervalos de uma fonte 1080p autorizada e cancelamento; nao cobrem 720p, 4K, transmissao gravada com mais de uma hora ou bytes efetivamente transferidos pela rede. A ferramenta exige audio e video no arquivo final. Consulte `docs/VALIDACAO-FINAL.md` para resultados e roteiro restante.
