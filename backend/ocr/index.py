import os
import json
import base64
import urllib.request


def handler(event: dict, context) -> dict:
    """
    OCR функция: принимает base64-изображение,
    распознаёт текст через Yandex Vision OCR (рукопись + печать) и возвращает распознанный текст
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }

    raw_body = event.get('body') or '{}'
    body = json.loads(raw_body)
    image_data = body.get('image')

    if not image_data:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Нужен image (base64)'}, ensure_ascii=False)
        }

    if ',' in image_data:
        image_b64 = image_data.split(',', 1)[1]
    else:
        image_b64 = image_data

    api_key = os.environ['YANDEX_VISION_API_KEY']

    payload = json.dumps({
        "mimeType": "JPEG",
        "languageCodes": ["ru", "en"],
        "model": "handwritten",
        "content": image_b64
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Api-Key {api_key}',
        },
        method='POST'
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode('utf-8'))

    blocks = result.get('result', {}).get('textAnnotation', {}).get('blocks', [])
    lines_text = []
    for block in blocks:
        for line in block.get('lines', []):
            line_str = ' '.join(
                alt.get('text', '')
                for word in line.get('words', [])
                for alt in word.get('alternativeTexts', [word])[:1]
            )
            if line_str.strip():
                lines_text.append(line_str.strip())

    text = '\n'.join(lines_text)

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'text': text}, ensure_ascii=False)
    }
