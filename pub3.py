import urllib.request, urllib.parse, json, time

def api(url, data=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None, method='POST' if data else 'GET')
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def publish(token, page_id, video_url, caption, cover_url=None):
    pd = api(f'https://graph.facebook.com/v21.0/{page_id}?fields=access_token,instagram_business_account&access_token={token}')
    pt, ig = pd['access_token'], pd['instagram_business_account']['id']
    params = {'access_token':pt, 'video_url':video_url, 'media_type':'REELS', 'caption':caption}
    if cover_url: params['cover_url'] = cover_url
    d = api(f'https://graph.facebook.com/v21.0/{ig}/media', params)
    cid = d.get('id')
    if not cid: return f"Container error: {d}"
    for i in range(30):
        time.sleep(3 if i < 5 else 5)
        s = api(f'https://graph.facebook.com/v21.0/{cid}?fields=status_code&access_token={pt}')
        if s.get('status_code') == 'FINISHED':
            pub = api(f'https://graph.facebook.com/v21.0/{ig}/media_publish', {'access_token':pt, 'creation_id':cid})
            return f"PUBLISHED: {pub.get('id')}"
        if s.get('status_code') == 'ERROR': return f"IG ERROR: {s}"
        print(f"  ...{s.get('status_code')} ({(i+1)*3}s)")
    return "TIMEOUT"

posts = [
  {
    "name": "Pet Way (Eu quero comentários reais)",
    "token": "EAARz6rkx864BRLo0o4pUhqBBaJWLhG1ZAqExUZB7qbV3B6463sK0ErepOiZAhg0Wx1tyaIIwDs0oyxZBKEFIHQ7VsmHav7USNh4KSdNXhzQ9lhqiKVawfEW9tgIPdq1IQUWydBD4hg0zE9bEpqPWqVk3O5MofnQLTyz44EEqIZBsM8swllVSol5lhKoMFdbgs3r0OZAIZBZA",
    "page_id": "620081894526259",
    "video": "https://pub-071b4a81e5744162a9f12c9361fde924.r2.dev/uploads/1774971656301-PW_Loucura.mp4",
    "cover": "https://pub-071b4a81e5744162a9f12c9361fde924.r2.dev/uploads/1775147222428-1774648711200_Artboard_7.jpg",
    "caption": "Eu quero comentários reais, até porque por amor vale tudo!\nConta aqui pra gente...\n#pets #crechedospets #amor #loucuradeamor #paidepet #campogranderj #trend",
    "sp_id": "1f893637-37fa-46ab-a986-e22acdbb5c63",
    "demand_id": "3555802b-3dcb-4e19-ae30-011ab51d6f2e"
  },
  {
    "name": "Guaratiba Net (Estresse com internet)",
    "token": "EAARz6rkx864BRFwDk9yicsIYXghtb4ZBjJQarGgdbyaZCQ9Ekj0MZCTFDjnX6ifB8RZCy2eUoomRINpKtwSVjUNdFDy75qRdBDVyB2jCyyG7mwKZAbSZCCCu9eiZCq2g0gLloT1ZAUtHGyGjYIFMf2V214gZCX015ZBvBi01ufvZBZAmRGwWSZAUSxyLzHDZCUXrF5T0phiaAhaMCY",
    "page_id": "1552530418374306",
    "video": "https://pub-071b4a81e5744162a9f12c9361fde924.r2.dev/uploads/1774981366767-GN_3Coisas_L_.mp4",
    "cover": "https://pub-071b4a81e5744162a9f12c9361fde924.r2.dev/uploads/1775147240514-1774627289449_Artboard_7.jpg",
    "caption": "Estresse com internet, provavelmente não foi uma vez só.\nCai quando você mais precisa, entrega menos do que promete e, quando dá problema… some quem deveria resolver.\nE o pior: você começa a achar que isso é normal, mas não é.\nInternet não deveria te atrasar, te fazer perder venda ou travar sua rotina, ela deveria simplesmente funcionar, sem dor de cabeça.\nQuando o básico deixa de ser problema, você percebe o quanto estava acostumado com pouco.\nTalvez não seja \"só a sua internet\", talvez seja o padrão que você aceitou até agora.\nDeixa a GN ser solução para você?\n#guaratibanet #gn #campogranderj #guaratiba #internet #provedordeinternet #rededeinternet #conexão #problemasreais",
    "sp_id": "64e96d7a-e9fe-480e-b86a-ff47ebff4db9",
    "demand_id": "9f5bc3c0-8631-44ec-be03-e908cfc57c16"
  },
  {
    "name": "Rzk Química (Você não tem nada velho)",
    "token": "EAARz6rkx864BRCQUyCtZCXnPCDZAmVKglH3XItV5VOqRVkTQXE1eEg9fdYhoZBG85XAS84zkD9IwYAcDbYSx0WPNjdRX62SPr9zpxwOA7nBz1tjTPyJORBYQv3cWIEJEn3fHZAtDbeytiYTxo1jqbZAQrGg52JMaZCp9a139e2T0GsYkE8sa9YZAxfjzNZClsPerliHHE8UO",
    "page_id": "551103385026685",
    "video": "https://pub-071b4a81e5744162a9f12c9361fde924.r2.dev/uploads/1774933849937-RZK_Chinelo_L_.mp4",
    "cover": "https://pub-071b4a81e5744162a9f12c9361fde924.r2.dev/uploads/1775147242784-1774665857518_Artboard_9.jpg",
    "caption": "Você não tem nada velho, só não conhece os produtos da Rzk!\nCom o 101 home é feito solução multiuso! Funciona e trás resultado, no que você pensar e precisar.\nAcessa o site da Rzk, e garanta o seu (no tamanho que achar necessário!)\nRzk.com.br",
    "sp_id": "fb977d98-d53c-4293-9bf9-9b3537912706",
    "demand_id": "9a0026b5-0c72-4738-b14f-a43df3b9d828"
  }
]

for p in posts:
    print(f"\n{'='*50}\n{p['name']}")
    r = publish(p['token'], p['page_id'], p['video'], p['caption'], p['cover'])
    print(f"Result: {r}")

print("\n" + "="*50 + "\nDONE")
