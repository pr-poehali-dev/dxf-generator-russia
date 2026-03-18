import os
import json
import urllib.request
import urllib.error


def handler(event: dict, context) -> dict:
    """
    OCR функция: принимает base64-изображение,
    отправляет в Yandex Cloud Vision OCR и возвращает распознанный текст
    с размерами деталей в формате: ШxВ — N шт
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
    image_data = body.get('image')  # base64 строка (data:image/...;base64,... или чистый base64)

    if not image_data:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Нужен image (base64)'}, ensure_ascii=False)
        }

    api_key = os.environ.get('YANDEX_VISION_API_KEY', '')
    if not api_key:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'YANDEX_VISION_API_KEY не настроен'}, ensure_ascii=False)
        }

    # Извлекаем чистый base64 без data URI префикса
    if ',' in image_data:
        image_b64 = image_data.split(',', 1)[1]
    else:
        image_b64 = image_data

    # Запрос к Yandex Vision OCR
    payload = {
        'mimeType': 'JPEG',
        'languageCodes': ['ru', 'en'],
        'content': image_b64
    }

    req_data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText',
        data=req_data,
        headers={
            'Authorization': f'Api-Key {api_key}',
            'Content-Type': 'application/json',
            'x-data-logging-enabled': 'false'
        },
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=25) as resp:
        result = json.loads(resp.read().decode('utf-8'))

    # Извлекаем все строки текста из ответа Yandex Vision
    lines = []
    try:
        blocks = result.get('result', {}).get('textAnnotation', {}).get('blocks', [])
        for block in blocks:
            for line in block.get('lines', []):
                line_text = line.get('text', '').strip()
                if line_text:
                    lines.append(line_text)
    except Exception:
        lines = []

    text = '\n'.join(lines)

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'text': text}, ensure_ascii=False)
    }
