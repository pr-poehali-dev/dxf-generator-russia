import os
import json
import urllib.request


def handler(event: dict, context) -> dict:
    """
    OCR функция: принимает base64-изображение,
    распознаёт текст через OpenAI GPT-4o Vision и возвращает распознанный текст с размерами
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
        mime = image_data.split(';')[0].replace('data:', '')
        image_b64 = image_data.split(',', 1)[1]
    else:
        mime = 'image/jpeg'
        image_b64 = image_data

    api_key = os.environ['OPENAI_API_KEY']

    payload = json.dumps({
        "model": "gpt-4o",
        "max_tokens": 1000,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Распознай все размеры на этом изображении. "
                            "Выведи каждый размер на отдельной строке в формате: ШИРИНА x ВЫСОТА — КОЛИЧЕСТВО шт\n"
                            "Например: 997 x 347 — 6 шт\n"
                            "Если количество не указано — пиши 1 шт.\n"
                            "Выводи ТОЛЬКО строки с размерами, без пояснений."
                        )
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime};base64,{image_b64}",
                            "detail": "high"
                        }
                    }
                ]
            }
        ]
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.openai.com/v1/chat/completions',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
        },
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=25) as resp:
        result = json.loads(resp.read().decode('utf-8'))

    text = result['choices'][0]['message']['content'].strip()

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'text': text}, ensure_ascii=False)
    }
