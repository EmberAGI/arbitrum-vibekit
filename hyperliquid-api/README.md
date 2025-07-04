Steps to run the API:

1. Create virtual environment:

```bash
python3 -m venv venv
```

2. Activate virtual environment:

```bash
source venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Run the API:

```bash
python main.py
```

5. Test the API:

```bash
curl http://localhost:5000/test-price/ETH
```