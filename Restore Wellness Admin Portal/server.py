"""Local server for the Restore Wellness Admin Portal (front-end build only).

- Serves the portal folder on http://localhost:8765/
- POST /api/save?file=<key> writes one whitelisted JSON file in data/,
  after copying the old version to data/_history/.

DEVELOPER: this is a stand-in. Production must replace it with a real API that
checks the logged-in role (only Management may save price / cost files) and
filters cost fields server-side (see FIELD_POLICY in js/core.js).
"""
import json
import os
import shutil
import sys
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data')
HISTORY = os.path.join(DATA, '_history')
PORT = int(os.environ.get('PORT', '8765'))

# key -> file in data/. Only these can be written.
WRITABLE = {
    'costCalc': 'cost_calc_data.json',
    'packages': 'restore_packages.json',
    'products': 'products.json',
    'settings': 'app_settings.json',
    'companies': 'companies.json',
    'people': os.path.join('mock', 'people.json'),
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        url = urlparse(self.path)
        if url.path == '/api/plans/save':
            return self._save_plan()
        if url.path == '/api/customers/save':
            return self._save_customer()
        if url.path == '/api/sales/save':
            return self._save_sale()
        if url.path == '/api/upload':
            return self._upload(parse_qs(url.query))
        if url.path != '/api/save':
            return self._reply(404, {'ok': False, 'error': 'Not found'})
        key = (parse_qs(url.query).get('file') or [''])[0]
        name = WRITABLE.get(key)
        if not name:
            return self._reply(400, {'ok': False, 'error': f'File "{key}" cannot be saved'})
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if length > 5_000_000:
                return self._reply(413, {'ok': False, 'error': 'Too large'})
            obj = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(obj, dict):
                raise ValueError('Expected a JSON object')
        except Exception as e:  # bad JSON
            return self._reply(400, {'ok': False, 'error': f'Invalid JSON: {e}'})

        path = os.path.join(DATA, name)
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        os.makedirs(HISTORY, exist_ok=True)
        if os.path.exists(path):
            shutil.copy2(path, os.path.join(HISTORY, f'{os.path.basename(name)[:-5]}.{stamp}.json'))
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        self._reply(200, {'ok': True, 'file': name, 'backup': stamp})

    def _save_plan(self):
        """Insert or replace ONE plan by id, so a nutritionist never overwrites other plans.
        DEVELOPER: production must check the role here, build the price snapshot server-side
        (unit_cost / econ come from the server, never from a nutritionist's browser), and only
        let Management approve or reject."""
        try:
            length = int(self.headers.get('Content-Length') or 0)
            plan = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(plan, dict) or not plan.get('id'):
                raise ValueError('plan.id missing')
        except Exception as e:
            return self._reply(400, {'ok': False, 'error': f'Invalid plan: {e}'})
        path = os.path.join(DATA, 'mock', 'plans.json')
        with open(path, encoding='utf-8') as f:
            doc = json.load(f)
        plans = doc.setdefault('plans', [])
        idx = next((i for i, p in enumerate(plans) if p.get('id') == plan['id']), None)
        if idx is None:
            plans.append(plan)
        else:
            plans[idx] = plan
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        self._reply(200, {'ok': True, 'id': plan['id']})

    def _read_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def _save_customer(self):
        """body: {"mode": "create" | "update", "customer": {...}}
        create: refuses a phone that already exists (409), even if the caller cannot see that customer.
        update: SHALLOW MERGE into the stored record, so fields a role never received
        (e.g. health_notes for Admin) are kept, not wiped.
        DEVELOPER: production must also check which fields each role may change."""
        try:
            body = self._read_json()
            mode, cust = body.get('mode'), body.get('customer') or {}
            phone = str(cust.get('phone') or '')
            if not (phone.isdigit() and phone.startswith('60') and 10 <= len(phone) <= 13):
                raise ValueError('phone must be 60XXXXXXXXX')
        except Exception as e:
            return self._reply(400, {'ok': False, 'error': f'Invalid customer: {e}'})
        path = os.path.join(DATA, 'mock', 'customers.json')
        with open(path, encoding='utf-8') as f:
            doc = json.load(f)
        rows = doc.setdefault('customers', [])
        cur = next((c for c in rows if c.get('phone') == phone), None)
        if mode == 'create':
            if cur:
                return self._reply(409, {'ok': False, 'error': 'This customer already exists'})
            rows.append(cust)
        elif mode == 'update':
            if not cur:
                return self._reply(404, {'ok': False, 'error': 'Customer not found'})
            cur.update(cust)
        else:
            return self._reply(400, {'ok': False, 'error': 'mode must be create or update'})
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        self._reply(200, {'ok': True, 'phone': phone})

    def _write(self, path, doc):
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    def _save_sale(self):
        """body: {"action": "create" | "confirm" | "unconfirm", "sale": {...}, "by": "<person id>"}
        confirm also adds a prepaid balance to the customer (prepaid products); unconfirm removes it if unused.
        DEVELOPER: production must (1) check the discount rule server-side again, (2) allow confirm/unconfirm
        for Management only, (3) on confirm write Restore Wellness sales to the Google Sheet (Daily Sales)."""
        try:
            body = self._read_json()
            action, sale = body.get('action'), body.get('sale') or {}
            if not sale.get('id'):
                raise ValueError('sale.id missing')
        except Exception as e:
            return self._reply(400, {'ok': False, 'error': f'Invalid sale: {e}'})
        spath = os.path.join(DATA, 'mock', 'sales.json')
        cpath = os.path.join(DATA, 'mock', 'customers.json')
        with open(spath, encoding='utf-8') as f:
            sdoc = json.load(f)
        rows = sdoc.setdefault('sales', [])
        cur = next((s for s in rows if s.get('id') == sale['id']), None)
        today = datetime.now().strftime('%Y-%m-%d')
        if action == 'create':
            if cur:
                return self._reply(409, {'ok': False, 'error': 'Sale already exists'})
            sale['status'] = 'pending'
            rows.append(sale)
        elif action in ('confirm', 'unconfirm'):
            if not cur:
                return self._reply(404, {'ok': False, 'error': 'Sale not found'})
            with open(cpath, encoding='utf-8') as f:
                cdoc = json.load(f)
            cust = next((c for c in cdoc.get('customers', []) if c.get('phone') == cur.get('phone')), None)
            if action == 'confirm':
                if cur.get('status') == 'confirmed':
                    return self._reply(409, {'ok': False, 'error': 'Already confirmed'})
                cur.update(status='confirmed', confirmed_by=body.get('by'), confirmed_date=today)
                if cur.get('prepaid') and cust is not None:
                    cust.setdefault('prepaid', []).append({'sale_id': cur['id'], 'product': cur['product'],
                        'total_rm': cur['amount_rm'], 'used_rm': 0, 'valid_until': cur.get('valid_until')})
            else:
                if cust is not None:
                    used = [p for p in cust.get('prepaid', []) if p.get('sale_id') == cur['id'] and p.get('used_rm')]
                    if used:
                        return self._reply(409, {'ok': False, 'error': 'Prepaid balance already used — cannot undo'})
                    cust['prepaid'] = [p for p in cust.get('prepaid', []) if p.get('sale_id') != cur['id']]
                cur.update(status='pending')
                cur.pop('confirmed_by', None)
                cur.pop('confirmed_date', None)
            self._write(cpath, cdoc)
        else:
            return self._reply(400, {'ok': False, 'error': 'Unknown action'})
        self._write(spath, sdoc)
        self._reply(200, {'ok': True, 'id': sale['id']})

    def _upload(self, q):
        """Save one PDF to data/uploads/<phone>/. DEVELOPER: production must store files privately
        and only serve them to roles allowed to see the customer's reports."""
        phone = (q.get('phone') or [''])[0]
        name = (q.get('name') or ['report.pdf'])[0]
        if not (phone.isdigit() and phone.startswith('60')):
            return self._reply(400, {'ok': False, 'error': 'Bad phone'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > 15_000_000:
            return self._reply(413, {'ok': False, 'error': 'File must be under 15 MB'})
        data = self.rfile.read(length)
        if not data.startswith(b'%PDF'):
            return self._reply(400, {'ok': False, 'error': 'Only PDF files'})
        safe = ''.join(ch if ch.isalnum() or ch in '-_. ' else '_' for ch in os.path.basename(name))[:80] or 'report.pdf'
        if not safe.lower().endswith('.pdf'):
            safe += '.pdf'
        folder = os.path.join(DATA, 'uploads', phone)
        os.makedirs(folder, exist_ok=True)
        fname = datetime.now().strftime('%Y%m%d-%H%M%S-') + safe
        with open(os.path.join(folder, fname), 'wb') as f:
            f.write(data)
        self._reply(200, {'ok': True, 'path': f'data/uploads/{phone}/{fname}'})

    def _reply(self, code, body):
        data = json.dumps(body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if self.command == 'POST':
            sys.stderr.write('%s %s\n' % (self.command, self.path))


if __name__ == '__main__':
    print(f'Restore Wellness Admin Portal: http://localhost:{PORT}/  (close this window to stop)')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
