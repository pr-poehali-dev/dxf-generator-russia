import os
import json
import base64
import subprocess
import tempfile


def handler(event: dict, context) -> dict:
    """
    OCR функция: принимает base64-изображение,
    распознаёт текст через Tesseract OCR (rus+eng) и возвращает строки с размерами деталей
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

    # Извлекаем чистый base64
    if ',' in image_data:
        image_b64 = image_data.split(',', 1)[1]
    else:
        image_b64 = image_data

    image_bytes = base64.b64decode(image_b64)

    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_img:
        tmp_img.write(image_bytes)
        tmp_img_path = tmp_img.name

    out_path = tmp_img_path.replace('.jpg', '_out')

    subprocess.run(
        ['tesseract', tmp_img_path, out_path, '-l', 'rus+eng', '--psm', '6'],
        check=True,
        capture_output=True
    )

    with open(out_path + '.txt', 'r', encoding='utf-8') as f:
        text = f.read().strip()

    os.unlink(tmp_img_path)
    os.unlink(out_path + '.txt')

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'text': text}, ensure_ascii=False)
    }