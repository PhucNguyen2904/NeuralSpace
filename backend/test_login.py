import sys
import codecs
sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

response = client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "test"})
print(response.status_code)
print(response.json())
