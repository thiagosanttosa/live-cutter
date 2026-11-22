# Atualizações e releases do LIVE CUTTER

## Estado desta cópia

O versionamento é dirigido por `package.json` (`0.1.0`), exposto na interface via `app.getVersion()`, usado no nome do instalador pelo electron-builder e conferido por `npm run version:check` contra `CHANGELOG.md`. A cópia atual não tem pasta Git, remote ou release. Nenhum `owner`, `repo`, token ou endpoint foi inventado. O atualizador fica como **NOT CONFIGURED** neste build.

O app usa `electron-updater` 6.8.12 com NSIS. As chamadas de check/download são manuais, downloads automáticos e instalação ao sair estão desligados. O updater só aceita o `app-update.yml` gerado pelo electron-builder para o feed GitHub configurado no build. O Renderer não recebe URLs ou API interna do updater. O `win.verifyUpdateCodeSignature` permanece `true`; o serviço não habilita um feed que desligue essa verificação ou não traga um `publisherName` real.

O instalador Etapa 6 atual (0.1.0) não foi produzido com `publish` configurado e não contém a configuração de feed. Mesmo depois de criar o repositório e obter certificado, quem já instalou essa versão terá de instalar manualmente uma versão base preparada para atualizações. As builds seguintes podem então atualizar via NSIS quando feed e certificado correspondam.

## Provedor planejado: GitHub Releases

GitHub Releases foi escolhido por ser compatível com electron-builder e guardar instaladores, metadados e notas de release. Quando existir o repositório público, o proprietário deve preencher no bloco `build` de `package.json`:

```json
"publish": [
  {
    "provider": "github",
    "owner": "PREENCHER_COM_O_OWNER_REAL",
    "repo": "PREENCHER_COM_O_REPO_REAL",
    "releaseType": "release"
  }
]
```

Não deixe os valores de exemplo como configuração utilizável. Mantenha `win.verifyUpdateCodeSignature: true`. Obtenha certificado Authenticode legítimo; configure `CSC_LINK` e `CSC_KEY_PASSWORD` somente como secrets do CI ou no ambiente seguro do responsável. Não salve PFX, senha ou token no repositório. Confirme no executável instalado o subject do certificado e mantenha o mesmo publisher entre builds. Se houver rotação, valide os nomes de publicador compatíveis antes de publicar.

`npm run dist:win` usa explicitamente `--publish never`: produz o instalador e, quando o provider estiver configurado, seus metadados, mas não cria nem publica uma Release. Depois da revisão e autorização explícita do responsável, envie manualmente para a GitHub Release o instalador, `.blockmap`, `latest.yml` e as notas da versão. O fluxo `.github/workflows/build-windows.yml` apenas testa, compila e guarda o artefato de CI; não cria Releases nem envia binários a usuários.

## Criar e verificar uma versão

1. Escolha a mudança de versão SemVer: PATCH para correção compatível, MINOR para função compatível, MAJOR para mudança incompatível. Enquanto o produto não estiver estável, use uma versão `0.x.y`; reserve `1.0.0` para o primeiro compromisso de estabilidade pública.
2. Altere `package.json` e mantenha `package-lock.json` sincronizado com `npm install --package-lock-only`. Adicione `## [VERSÃO] - AAAA-MM-DD` em `CHANGELOG.md` e descreva os efeitos visíveis.
3. Rode `npm run version:check`, `npm test`, `npm run typecheck` e `npm run build`.
4. Para integração de teste, crie duas versões com owners/releases temporários e um certificado de teste confiável numa VM isolada. Use provedor de teste HTTPS dedicado. Não publique essas versões no canal real. Verifique que builds têm o mesmo publisher, `app-update.yml` contém o feed previsto, a assinatura, manifesto e SHA-512 correspondem e a instalação base é a antiga.
5. Faça `npm run dist:win`, confirme a assinatura e os metadados localmente. O comando não publica. Para uma publicação real, faça a revisão e autorize explicitamente o upload da nova Release; não use `--publish always` num commit comum.
6. Depois de enviar a Release autorizada, instale o build base habilitado, clique em **CHECK FOR UPDATES**, confira versão/notas/tamanho, escolha **DOWNLOAD UPDATE**, acompanhe ou cancele e só então confirme **INSTALL AND RESTART**. Repita enquanto um corte estiver ativo para validar que a instalação fica bloqueada.

Para testar visualmente o estado sem provedor, os testes de unidade usam um updater falso; isso verifica apenas a máquina de estados e não representa uma atualização real. Uma instalação real NSIS requer GitHub feed de teste, versões distintas e assinaturas Authenticode em ambiente isolado. Não foi executada nesta cópia: não há remote/certificado e a política de Controle de Aplicativos local bloqueou o instalador anterior.

## Dados e dependências

O instalador NSIS substitui os arquivos da aplicação. Preferências e histórico em `app.getPath('userData')` e vídeos na pasta escolhida permanecem fora da instalação. yt-dlp, FFmpeg e FFprobe são ferramentas fixadas no instalador, não são substituídas pelo updater. Para trocar alguma delas, faça uma atualização controlada do binário e licenças, revise origem e checksum e publique um novo instalador após repetir testes.

Sem assinatura Authenticode, SmartScreen pode alertar e o updater mantém a instalação bloqueada em vez de dispensar verificação. A ausência de assinatura e reputação do publisher também limita a distribuição segura. Esta configuração não chama o atualizador ao iniciar e não baixa ou instala sem ação explícita do usuário.
