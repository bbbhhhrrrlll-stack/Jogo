# Rouba Bichos 3D com servidor online

Três arquivos: `index.html` (o jogo), `server.js` (salas online) e `package.json`.
O `server.js` também entrega o jogo, então você hospeda tudo num lugar só. Não precisa instalar nada.

## Testar no seu computador
1. Instale o Node.js (versão 18 ou mais nova).
2. Na pasta, rode `node server.js`.
3. Abra http://localhost:3000 em duas abas e teste o modo online.

## Colocar na internet (Render, plano grátis)
1. Crie um repositório no GitHub e suba os 3 arquivos.
2. No Render, crie um **Web Service** ligado ao repositório.
3. Runtime **Node**, Build Command em branco (ou `npm install`), Start Command `node server.js`.
4. Quando terminar, o endereço `https://seu-app.onrender.com` já é o jogo, com online funcionando.

Railway e Fly.io funcionam igual (comando de início `node server.js`, e eles dão a porta pela variável PORT).
No plano grátis do Render o servidor dorme quando ninguém usa, e a primeira pessoa espera cerca de um minuto.

## Se o index.html ficar em outro site (itch.io, GitHub Pages...)
Abra o `index.html`, ache `var SERVER_URL=''` e troque por `var SERVER_URL='wss://seu-app.onrender.com/ws'`.

## Como funciona
- Salas de até 8 pessoas. Vagas vazias ficam com bots.
- Quem cria a sala roda a partida no navegador e o servidor só retransmite. Se ele sair, outro jogador assume.
- Partida aleatória: o jogo procura entre as salas públicas `pub-1` a `pub-6` uma que já tenha gente.
- Como o anfitrião manda na partida, um jogador mal-intencionado poderia trapacear se for o anfitrião. Para jogar com amigos isso não costuma importar.
