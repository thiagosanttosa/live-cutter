# LIVE CUTTER — validação da distribuição Windows

Use uma máquina virtual Windows 10/11 limpa, sem Node.js, npm, Git, yt-dlp ou FFmpeg instalados. Mantenha uma cópia do instalador e registre a versão exibida em **Settings > SYSTEM STATUS**.

1. Execute `LIVE-CUTTER-Setup-<versão>-x64.exe`, escolha a instalação por usuário e confirme se o destino personalizado é respeitado.
2. Abra o LIVE CUTTER pelo menu Iniciar e pelo atalho da área de trabalho. Confirme nome, ícone e versão.
3. Em Settings, use **SYSTEM STATUS** > **CHECK AGAIN**. yt-dlp, FFmpeg, FFprobe e a pasta de saída devem mostrar versões/disponibilidade coerentes. Uma pasta sem permissão deve aparecer como indisponível com mensagem explicativa.
4. Consulte metadados de um vídeo público acessível. Confirme validação de URL, título e duração.
5. Escolha uma pasta de saída gravável e um intervalo curto de mídia para a qual exista autorização. Gere um corte. Confirme progresso quando fornecido, finalização, MP4, áudio/vídeo e duração, e valide o resultado via FFprobe.
6. Inicie outro corte e cancele durante o download. Confirme o estado cancelado e a ausência de arquivo temporário residual.
7. Abra o arquivo e a pasta pelo resultado e pelo histórico. Reinicie o app; confirme histórico, preferência de qualidade, padrão de nome e pasta escolhida.
8. Desinstale pelo item do menu Iniciar ou Configurações > Aplicativos. Confirme a remoção do aplicativo e dos atalhos. Confirme que a desinstalação preservou `userData` e arquivos de vídeo.

O teste deve ser executado de fato nessa VM antes de afirmar que o produto foi validado numa instalação limpa. Este roteiro não declara esses passos aprovados por si só. O instalador gerado sem certificado não tem assinatura digital; o SmartScreen pode avisar sobre o editor ou reputação do download.

Consulte `VALIDACAO-FINAL.md` no pacote de distribuição para os resultados verificados nesta build. Os passos acima são um roteiro para uma VM limpa; eles não indicam que a instalação manual foi concluída.

## Localizações usadas

- Executáveis de mídia: `resources/yt-dlp/yt-dlp.exe`, `resources/ffmpeg/ffmpeg.exe` e `resources/ffmpeg/ffprobe.exe`, ao lado do app instalado e fora do ASAR.
- Configurações e histórico: `app.getPath('userData')/settings.json` e `clip-history.json`.
- Cortes: por padrão, `app.getPath('videos')/LIVE CUTTER`, alterável em Settings.
- Temporários de processamento: `app.getPath('temp')/live-cutter-jobs`, removidos ao terminar ou cancelar.

O app mantém preferências e histórico ao desinstalar. Os vídeos são arquivos do usuário e não são removidos pelo desinstalador.
