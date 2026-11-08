#!/usr/bin/env python3
"""Generate the neutral AG2 test data inside a COPY of the SillyTavern data dir.

Usage: tools/ag2/gen-testdata.py /opt/server-agent/workspace/st-testdata/ag2-data

Never run this against production data: it refuses any path that is not an
"ag2-data" directory. Everything written here is fictional, adult, neutral
content (RUNBOOK 4.2). Re-running is idempotent: it rewrites the same files and
re-anchors all timestamps on "now", so "today / yesterday / this week / older"
buckets stay correct whenever the data is regenerated.
"""
import base64, hashlib, json, os, struct, sys, zlib
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '')
assert os.path.basename(ROOT) == 'ag2-data' and '/sillytavern/' not in ROOT + '/', 'refusing: not an ag2-data copy'
U = os.path.join(ROOT, 'default-user')
CH, CHATS, GROUPS, GCHATS = (os.path.join(U, d) for d in ('characters', 'chats', 'groups', 'group chats'))
for d in (CH, CHATS, GROUPS, GCHATS):
    os.makedirs(d, exist_ok=True)

USER = '旅人'
NOW = datetime.now(timezone.utc).astimezone()
TODAY = NOW.replace(hour=0, minute=0, second=0, microsecond=0)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.') + f'{dt.microsecond // 1000:03d}Z'


# ---------------------------------------------------------------- PNG cards
def png_chunks(b):
    i, out = 8, []
    while i < len(b):
        n, = struct.unpack('>I', b[i:i + 4])
        out.append((b[i + 4:i + 8], b[i + 8:i + 8 + n]))
        i += 12 + n
    return out


def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)


def letter_png(letter, rgb, size=400):
    """Plain colour square with a big initial (PIL), returned as PNG bytes."""
    from io import BytesIO
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new('RGB', (size, size), rgb)
    dr = ImageDraw.Draw(im)
    font = None
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(f):
            font = ImageFont.truetype(f, size // 2)
            break
    font = font or ImageFont.load_default()
    box = dr.textbbox((0, 0), letter, font=font)
    dr.text(((size - box[2] - box[0]) / 2, (size - box[3] - box[1]) / 2), letter, fill=(255, 255, 255), font=font)
    bio = BytesIO()
    im.save(bio, 'PNG')
    return bio.getvalue()


def write_card(fname, base_png, card):
    """base_png: bytes of an image PNG. All text chunks are replaced by our card."""
    b = base_png
    chunks = [(t, d) for t, d in png_chunks(b) if t not in (b'tEXt', b'iTXt', b'zTXt')]
    payload = base64.b64encode(json.dumps(card, ensure_ascii=False).encode()).decode()
    out = b[:8]
    for t, d in chunks:
        if t == b'IEND':
            out += chunk(b'tEXt', b'chara\0' + payload.encode())
            out += chunk(b'tEXt', b'ccv3\0' + payload.encode())
        out += chunk(t, d)
    open(os.path.join(CH, fname), 'wb').write(out)


def card(name, desc, personality, scenario, first, tags, created):
    data = {
        'name': name, 'description': desc, 'personality': personality, 'scenario': scenario,
        'first_mes': first, 'mes_example': '', 'creator_notes': 'AG2 neutral test character', 'system_prompt': '',
        'post_history_instructions': '', 'tags': tags, 'creator': 'ag2-test', 'character_version': '1.0',
        'alternate_greetings': [], 'extensions': {'talkativeness': '0.5', 'fav': False, 'world': '', 'depth_prompt': {'prompt': '', 'depth': 4, 'role': 'system'}},
        'group_only_greetings': [],
    }
    return {
        'name': name, 'description': desc, 'personality': personality, 'scenario': scenario, 'first_mes': first,
        'mes_example': '', 'creatorcomment': 'AG2 neutral test character', 'avatar': 'none', 'chat': '',
        'talkativeness': '0.5', 'fav': False, 'tags': tags, 'spec': 'chara_card_v3', 'spec_version': '3.0',
        'data': data, 'create_date': created,
    }


CHARS = [
    # file stem, name, initial, colour, description, first message
    ('ag2_Aldric', '旅店老板 Aldric', 'A', (176, 112, 60),
     'Aldric 是“铜壶旅店”的老板，四十多岁，身材结实，留着修剪整齐的灰褐色胡子。他熟悉镇上每一条小路，喜欢给旅人讲附近山谷的传说。',
     '*铜壶旅店里炉火正旺。Aldric 擦着柜台，抬头冲你笑了笑。*\n\n"欢迎，旅人。外面的雨一时半会儿停不了，先来碗热汤？"'),
    ('ag2_Mira', '图书管理员 Mira', 'M', (70, 110, 170),
     'Mira 是王立图书馆的资深管理员，三十出头，戴一副圆框眼镜。她记得几乎每本藏书的位置，对古地图和星图尤其着迷。',
     '*高高的书架之间很安静，只有翻页的声音。Mira 推了推眼镜，把一摞旧书放到桌上。*\n\n"你要找的那本航海日志，我想我知道在哪儿。"'),
    ('ag2_Kael', '星港领航员 Kael', 'K', (60, 140, 120),
     'Kael 是环轨星港的资深领航员，冷静、话不多，曾带领上百艘货船穿过小行星带。业余时间喜欢修理老式无线电。',
     '*观景窗外，蓝色的行星缓缓转动。Kael 调整着导航台上的读数。*\n\n"航线已经算好了。出发前还有什么想确认的吗？"'),
]


def make_cards(default_chat):
    # card.chat = the chat ST opens when the character is selected (no .jsonl suffix).
    # Pointing it at a real file matters for tests: with write endpoints stubbed, ST
    # re-reads cards from disk after openCharacterChat(), so this is what it reports.
    created = (NOW - timedelta(days=30)).strftime('%Y-%m-%d @%Hh %Mm %Ss %fms')[:-5] + 'ms'
    for stem, name, letter, rgb, desc, first in CHARS:
        c = card(name, desc, '友善、可靠', '奇幻 / 日常', first, ['neutral-test'], created)
        c['chat'] = default_chat.get(stem, '')
        write_card(stem + '.png', letter_png(letter, rgb), c)


# ---------------------------------------------------------------- chats
def header(char_name, created, extra_meta=None):
    meta = {'integrity': 'ag2-' + hashlib.sha1((char_name + created).encode()).hexdigest()[:12], 'chat_id_hash': int(hashlib.sha1(created.encode()).hexdigest()[:12], 16), 'note_prompt': '', 'note_interval': 1, 'note_position': 1, 'note_depth': 4, 'note_role': 0, 'timedWorldInfo': {'sticky': {}, 'cooldown': {}}, 'tainted': True}
    meta.update(extra_meta or {})
    return {'user_name': 'unused', 'character_name': 'unused', 'create_date': created, 'chat_metadata': meta}


def msg(name, is_user, dt, text, swipes=None, reasoning=None, avatar=None, model='gemini-4-argon-high', tokens=None, gen_secs=None):
    m = {'name': name, 'is_user': is_user, 'is_system': False, 'send_date': iso(dt), 'mes': text, 'extra': {}}
    if is_user:
        m['force_avatar'] = 'User Avatars/user-default.png'
        m['extra'] = {'isSmallSys': False}
    else:
        m['extra'] = {'api': 'openai', 'model': model}
        if tokens:
            m['extra']['token_count'] = tokens
        if gen_secs:
            m['gen_started'] = iso(dt - timedelta(seconds=gen_secs))
            m['gen_finished'] = iso(dt)
        if reasoning:
            m['extra']['reasoning'] = reasoning
            m['extra']['reasoning_duration'] = 14000
        if avatar:
            m['original_avatar'] = avatar
            m['force_avatar'] = f'/thumbnail?type=avatar&file={avatar}'
        sw = swipes or [text]
        m['swipes'] = sw
        m['swipe_id'] = sw.index(text) if text in sw else 0
        m['swipe_info'] = [{'send_date': m['send_date'], 'gen_started': m.get('gen_started'), 'gen_finished': m.get('gen_finished'), 'extra': dict(m['extra'])} for _ in sw]
    return m


def stem_date(dt):
    return dt.strftime('%Y-%m-%d@%Hh%Mm%Ss')


def write_chat(folder, fname, rows, mtime):
    d = os.path.join(CHATS, folder) if folder else GCHATS
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, fname)
    with open(p, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    os.utime(p, (mtime.timestamp(), mtime.timestamp()))
    return p


MD_LIST = '今晚的补给清单：\n\n- 两条黑麦面包\n- 一袋干苹果\n- 灯油（**别忘了**）\n  - 备用灯芯 ×3\n- 地图副本\n\n1. 先去码头\n2. 再去集市\n3. 日落前回来'
MD_CODE = '我把星港的对接流程写成了检查脚本，你看看：\n\n```python\ndef dock(ship, port):\n    assert ship.speed < 0.5, "减速后再对接"\n    for step in ("对准", "接触", "锁定"):\n        print(f"{ship.name}: {step}")\n    return port.assign_bay(ship)\n```\n\n行内代码像 `port.assign_bay()` 这样显示。'
MD_QUOTE = '那本日志的扉页上写着：\n\n> 海图会说谎，星星不会。\n> 迷路的时候，就抬头看。\n\n落款只有一个字母：**E**。'
MD_TABLE = '这是三条航线的对比：\n\n| 航线 | 距离（光分） | 风险 | 预计耗时 |\n|---|---:|---|---:|\n| 北环 | 42 | 低 | 3 小时 |\n| 小行星带 | 18 | 高 | 1.5 小时 |\n| 南向弧线 | 35 | 中 | 2.5 小时 |\n\n我建议走北环，*稳一点*。'
HTML_FRONTEND = '下面是今天的路线卡（前端渲染测试）：\n\n```html\n<!DOCTYPE html>\n<html><head><meta charset="utf-8"><style>body{margin:0;font:14px sans-serif;color:#eee;background:#1c1c22}.c{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px}.o{border:1px solid #444;border-radius:12px;padding:10px}</style></head>\n<body><div class="c"><div class="o">A · 去码头</div><div class="o">B · 去集市</div><div class="o">C · 回旅店</div><div class="o">D · 去图书馆</div></div></body></html>\n```'

LINES_A = [
    '外面的雨好大。今晚还有空房吗？',
    '"有的，二楼最里面那间，窗户对着山谷。"*Aldric 从柜台下取出一把铜钥匙，在你面前晃了晃。*"一晚六个银币，含早饭。"',
    '好，就要那间。山谷里有什么好玩的？',
    '*他放下抹布，压低声音。*"往北走半天，有一座废弃的钟楼。镇上人说，每逢满月，钟会自己响三下。"',
    '你信吗？',
    '"我年轻的时候去过一次。"*他笑了笑，没有正面回答。*"钟没响，但我在那儿捡到一枚很旧的硬币。"',
    '能给我看看吗？',
    '*Aldric 从脖子上解下一根皮绳，绳子上挂着一枚磨得发亮的铜币，正面是一只看不清的鸟。*',
]


def long_chat():
    """60+ messages across 3 days with swipes, reasoning, markdown and consecutive speakers."""
    name, av = '旅店老板 Aldric', 'ag2_Aldric.png'
    day0 = TODAY - timedelta(days=2)
    rows = [header(name, stem_date(day0 + timedelta(hours=19)))]
    t = day0 + timedelta(hours=19, minutes=2)
    rows.append(msg(name, False, t, CHARS[0][5], tokens=96, gen_secs=0))
    n = 0
    specials = {
        5: dict(text=MD_LIST, tokens=88, gen=6),
        9: dict(text=MD_QUOTE, tokens=64, gen=5, reasoning='用户问起那本旧日志。先描述扉页上的字，再留一个悬念：落款字母 E，可能和钟楼有关。'),
        13: dict(text='*他想了想。*"第一种说法：钟是被风吹响的。"', swipes=['*他想了想。*"第一种说法：钟是被风吹响的。"', '*他摸了摸胡子。*"第二种说法：守钟人从没离开过。"', '*他耸耸肩。*"第三种说法：根本没人听见过，只是故事越传越像真的。"'], tokens=40, gen=4),
        19: dict(text=MD_TABLE, tokens=120, gen=8),
        25: dict(text=MD_CODE, tokens=140, gen=9, reasoning='用户想看流程写成代码的样子。给一个简短的 Python 函数，并顺带演示行内代码。'),
        31: dict(text=HTML_FRONTEND, tokens=150, gen=7),
    }
    for day in range(3):
        base = day0 + timedelta(days=day, hours=19 if day == 0 else 9 + day * 3)
        t = base + timedelta(minutes=5)
        for i in range(11):
            n += 1
            u = LINES_A[(n * 2) % len(LINES_A)] if n % 4 else f'第 {day + 1} 天，第 {i + 1} 个问题：明天的天气会怎样？'
            rows.append(msg(USER, True, t, u))
            t += timedelta(minutes=2)
            sp = specials.get(n)
            if sp:
                rows.append(msg(name, False, t, sp['text'], swipes=sp.get('swipes'), reasoning=sp.get('reasoning'), tokens=sp['tokens'], gen_secs=sp['gen']))
            else:
                rows.append(msg(name, False, t, LINES_A[(n * 2 + 1) % len(LINES_A)] + f'\n\n（第 {day + 1} 天 · 第 {i + 1} 轮）', tokens=60 + i, gen_secs=3 + i % 4))
            t += timedelta(minutes=3)
            if i in (3, 8):  # consecutive messages from the same speaker
                rows.append(msg(name, False, t, '*他又补充了一句。*"对了，出门记得带伞。"', tokens=18, gen_secs=2))
                t += timedelta(minutes=1)
            if i == 6:
                rows.append(msg(USER, True, t, '等等，我再想想。'))
                t += timedelta(minutes=1)
                rows.append(msg(USER, True, t, '好了，继续吧。'))
                t += timedelta(minutes=1)
    # last message carries 3 swipes too (swipe pill only shows on the last message)
    last_sw = ['"晚安，旅人。明早见。"*Aldric 熄灭了柜台上的灯。*', '"睡个好觉。钟楼的事，明天再说。"', '"要是半夜听见钟声，别出门。"*他眨了眨眼。*']
    rows.append(msg(USER, True, t, '今天就到这里吧，晚安。'))
    t += timedelta(minutes=1)
    rows.append(msg(name, False, NOW - timedelta(minutes=20), last_sw[0], swipes=last_sw, tokens=30, gen_secs=3))
    return write_chat('ag2_Aldric', f'{name} - {stem_date(day0 + timedelta(hours=19))}.jsonl', rows, NOW - timedelta(minutes=20)), len(rows) - 1


def short_chat(stem, name, first, pairs, when, label):
    rows = [header(name, stem_date(when - timedelta(hours=1)))]
    t = when - timedelta(minutes=len(pairs) * 4 + 2)
    rows.append(msg(name, False, t, first, tokens=80, gen_secs=0))
    for u, a in pairs:
        t += timedelta(minutes=2)
        rows.append(msg(USER, True, t, u))
        t += timedelta(minutes=2)
        rows.append(msg(name, False, t, a, tokens=50, gen_secs=4))
    rows[-1]['send_date'] = iso(when)
    return write_chat(stem, f'{name} - {label}.jsonl', rows, when), len(rows) - 1


def main():
    made = []
    made.append(('long', *long_chat()))
    a = CHARS[0]
    made.append(('aldric-2', *short_chat('ag2_Aldric', a[1], a[5], [('我想问问钟楼的路。', '"沿着河往北，看到石桥就左转。"'), ('谢谢！', '"路上小心。"')], NOW - timedelta(days=4, hours=3), '钟楼的路')))
    m = CHARS[1]
    made.append(('mira-1', *short_chat('ag2_Mira', m[1], m[5], [('我在找一本航海日志。', '"三楼东侧，第七排。我带你去。"'), ('上面有作者名字吗？', '"只有一个字母：E。"')], NOW - timedelta(hours=2), stem_date(TODAY + timedelta(hours=8)))))
    made.append(('mira-2', *short_chat('ag2_Mira', m[1], m[5], [('星图能借出去吗？', '"只能在阅览室看，但可以临摹。"')], NOW - timedelta(days=12), '星图临摹')))
    k = CHARS[2]
    made.append(('kael-1', *short_chat('ag2_Kael', k[1], k[5], [('小行星带安全吗？', '"今天风暴指数很低，可以走。"'), ('那就出发。', '"系好安全带。"')], TODAY - timedelta(days=1) + timedelta(hours=21), '小行星带')))
    made.append(('kael-2', *short_chat('ag2_Kael', k[1], k[5], [('无线电修好了吗？', '"还差一个电容。"')], NOW - timedelta(days=40), '旧无线电')))
    made.append(('seraphina', *short_chat('default_Seraphina', 'Seraphina', '*The forest is quiet. Seraphina smiles softly.* "You are safe here, traveler."', [('Where am I?', '"In the Eldoria forest. Rest a while."'), ('Thank you.', '"You are welcome."')], TODAY - timedelta(days=1) + timedelta(hours=10), 'forest')))
    made.append(('assistant', *short_chat('default_Assistant', 'Assistant', 'Hello! How can I help you today?', [('列出三种常见的排序算法。', '1. 快速排序\n2. 归并排序\n3. 堆排序'), ('哪个最稳定？', '归并排序是稳定排序。')], NOW - timedelta(days=3), 'sorting')))

    stem_of = lambda p: os.path.basename(p)[:-len('.jsonl')]
    by = dict((k, p) for k, p, n in made)
    make_cards({'ag2_Aldric': stem_of(by['long']), 'ag2_Mira': stem_of(by['mira-1']), 'ag2_Kael': stem_of(by['kael-1'])})

    # ---- group: Aldric + Mira + Kael
    gid = 'ag2group01'
    gchat = f'{gid}-chat'
    group = {
        'id': gid, 'name': '旅途同伴', 'members': ['ag2_Aldric.png', 'ag2_Mira.png', 'ag2_Kael.png'], 'avatar_url': '',
        'allow_self_responses': False, 'activation_strategy': 0, 'generation_mode': 0, 'disabled_members': [],
        'fav': False, 'chat_id': gchat, 'chats': [gchat], 'auto_mode_delay': 5,
        'generation_mode_join_prefix': '', 'generation_mode_join_suffix': '', 'chat_metadata': {}, 'past_metadata': {},
        'date_added': int((NOW - timedelta(days=10)).timestamp() * 1000), 'create_date': stem_date(NOW - timedelta(days=10)),
        'date_last_chat': int((NOW - timedelta(hours=5)).timestamp() * 1000),
    }
    json.dump(group, open(os.path.join(GROUPS, gid + '.json'), 'w'), ensure_ascii=False, indent=4)
    rows = [header('旅途同伴', stem_date(NOW - timedelta(hours=6)))]
    t = NOW - timedelta(hours=6)
    for who, av, text in [
        (None, None, '大家明天几点出发？'),
        ('旅店老板 Aldric', 'ag2_Aldric.png', '"天亮就走。我准备了干粮。"'),
        ('图书管理员 Mira', 'ag2_Mira.png', '"我带了那张旧地图的临摹本。"'),
        ('星港领航员 Kael', 'ag2_Kael.png', '"我负责看方向。"'),
        (None, None, '那就这么定了。'),
        ('图书管理员 Mira', 'ag2_Mira.png', '"别忘了，钟楼那边下午容易起雾。"'),
    ]:
        t += timedelta(minutes=3)
        rows.append(msg(USER, True, t, text) if who is None else msg(who, False, t, text, avatar=av, tokens=24, gen_secs=3))
    rows[-1]['send_date'] = iso(NOW - timedelta(hours=5))
    write_chat(None, gchat + '.jsonl', rows, NOW - timedelta(hours=5))
    made.append(('group', os.path.join(GCHATS, gchat + '.jsonl'), len(rows) - 1))

    # ---- settings.json: neutral active character + persona name
    sp = os.path.join(U, 'settings.json')
    s = json.load(open(sp))
    s['active_character'] = 'ag2_Aldric.png'
    s['active_group'] = None
    s['username'] = USER
    s.setdefault('power_user', {}).setdefault('personas', {})['user-default.png'] = USER
    s['power_user']['default_persona'] = None
    tags = s.setdefault('tags', [])
    # tag id must not start with "ag2": shell residue checks look for id/class ag2*
    tags[:] = [t for t in tags if t.get('id') != 'ag2-test']
    if not any(t.get('id') == 'neutral-test' for t in tags):
        tags.append({'id': 'neutral-test', 'name': 'AG2 测试', 'color': '', 'color2': '', 'create_date': int(NOW.timestamp() * 1000)})
    for stem, *_ in CHARS:
        s.setdefault('tag_map', {})[stem + '.png'] = ['neutral-test']
    json.dump(s, open(sp, 'w'), ensure_ascii=False, indent=4)

    for k, p, n in made:
        print(f'{k:10s} {n:3d} msgs  {os.path.relpath(p, U)}')


if __name__ == '__main__':
    main()
