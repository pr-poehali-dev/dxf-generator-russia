import os
import json
import base64
import urllib.request
import urllib.error


def handler(event: dict, context) -> dict:
    """
    OCR функция: принимает base64-изображение или URL,
    отправляет в OpenAI GPT-4o Vision и возвращает распознанный текст
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
    image_data = body.get('image')  # base64 строка (data:image/...;base64,...)
    image_url = body.get('url')     # или URL изображения

    if not image_data and not image_url:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Нужен image (base64) или url'})
        }

    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'OPENAI_API_KEY не настроен'})
        }

    # Формируем content для Vision
    if image_data:
        # base64 может прийти как "data:image/jpeg;base64,/9j/..." — берём как есть
        if not image_data.startswith('data:'):
            image_data = 'data:image/jpeg;base64,' + image_data
        image_content = {
            'type': 'image_url',
            'image_url': {'url': image_data, 'detail': 'high'}
        }
    else:
        image_content = {
            'type': 'image_url',
            'image_url': {'url': image_url, 'detail': 'high'}
        }

    prompt = (
        'На изображении список деталей с размерами. '
        'Распознай все строки с размерами в формате: ШИРИНА × ВЫСОТА — КОЛИЧЕСТВО шт. '
        'Верни ТОЛЬКО строки с размерами, каждую на новой строке. '
        'Используй символ × для умножения и — для количества. '
        'Пример правильного вывода:\n'
        '997 × 322 — 2 шт\n'
        '997 × 347 — 8 шт\n'
        'Если количество не указано — не добавляй его. '
        'Верни ТОЛЬКО строки с размерами, никакого лишнего текста.'
    )

    payload = {
        'model': 'gpt-4o',
        'max_tokens': 500,
        'messages': [
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': prompt},
                    image_content
                ]
            }
        ]
    }

    req_data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=req_data,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=25) as resp:
        result = json.loads(resp.read().decode('utf-8'))

    text = result['choices'][0]['message']['content'].strip()

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'text': text})
    }