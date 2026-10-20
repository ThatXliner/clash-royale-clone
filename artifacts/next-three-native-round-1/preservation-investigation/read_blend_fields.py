"""Read Blender 5.1 uncompressed Object fields, without bpy or model mutation.
Header format follows installed Blender's pure-Python _blendfile_header.py.
DNA is the saved file's own schema. All field layout sizes are validated.
"""
import re
import struct
from pathlib import Path


class BlendFields:
    def __init__(self, path):
        self.data = Path(path).read_bytes()
        if self.data[:17] != b'BLENDER17-01v0501':
            raise ValueError(f'Unexpected header: {self.data[:17]!r}')
        self.blocks = []
        pos = 17
        while pos < len(self.data):
            code, dna, old, size, count = struct.unpack_from('<4siQqq', self.data, pos)
            self.blocks.append({'code': code.rstrip(b'\0'), 'dna': dna, 'old': old, 'size': size,
                                'count': count, 'offset': pos + 32})
            pos += 32 + size
            if code == b'ENDB':
                break
        if pos != len(self.data):
            raise ValueError(f'Block traversal ended at {pos}, actual size {len(self.data)}')
        b = next(b for b in self.blocks if b['code'] == b'DNA1')
        self.parse_dna(self.data[b['offset']:b['offset']+b['size']])

    def parse_dna(self, data):
        pos = 0
        def tag(value):
            nonlocal pos
            if data[pos:pos+4] != value:
                raise ValueError((value, data[pos:pos+4]))
            pos += 4
        def integer():
            nonlocal pos
            value = struct.unpack_from('<I', data, pos)[0]
            pos += 4
            return value
        def strings():
            nonlocal pos
            count = integer()
            result = []
            for _ in range(count):
                end = data.index(b'\0', pos)
                result.append(data[pos:end].decode())
                pos = end + 1
            pos = (pos + 3) & ~3
            return result
        tag(b'SDNA'); tag(b'NAME'); self.names = strings()
        tag(b'TYPE'); self.types = strings()
        tag(b'TLEN'); self.sizes = struct.unpack_from('<' + 'H'*len(self.types), data, pos)
        pos = (pos + 2 * len(self.types) + 3) & ~3
        tag(b'STRC'); total = integer(); self.structs = []
        for _ in range(total):
            type_id, fields_count = struct.unpack_from('<HH', data, pos); pos += 4
            fields, offset = [], 0
            for __ in range(fields_count):
                field_type, field_name = struct.unpack_from('<HH', data, pos); pos += 4
                name = self.names[field_name]
                count = 1
                for dim in re.findall(r'\[(\d+)\]', name): count *= int(dim)
                size = (8 if '*' in name else self.sizes[field_type]) * count
                fields.append({'name':name,'type':self.types[field_type],'offset':offset,'size':size,'count':count})
                offset += size
            self.structs.append({'name':self.types[type_id],'size':self.sizes[type_id],'computed_size':offset,'fields':fields})
        self.by_type = {s['name']:s for s in self.structs}

    def field(self, typename, name):
        schema = self.by_type[typename]
        if schema['computed_size'] != schema['size']:
            raise ValueError(f'Unvalidated structure layout: {typename}: {schema["computed_size"]} != {schema["size"]}')
        matches = [f for f in schema['fields'] if f['name'].split('[')[0].lstrip('*') == name]
        if len(matches) != 1: raise ValueError((typename,name,matches))
        return matches[0]

    def objects(self):
        idf = self.field('Object','id'); namef = self.field('ID','name')
        out = {}
        for block in self.blocks:
            if self.structs[block['dna']]['name'] != 'Object': continue
            if block['count'] != 1: raise ValueError('Expected single object block')
            start = block['offset']
            name_start = start + idf['offset'] + namef['offset']
            name = self.data[name_start:name_start+namef['size']].split(b'\0')[0].decode()
            if not name.startswith('OB'): raise ValueError(name)
            out[name[2:]] = {'block':block,'fields':{}}
            for field in self.by_type['Object']['fields']:
                if field['type'] == 'float' and '*' not in field['name']:
                    raw = self.data[start+field['offset']:start+field['offset']+field['size']]
                    out[name[2:]]['fields'][field['name']] = {'values':list(struct.unpack('<'+'f'*field['count'],raw)),
                                                           'hex':raw.hex(),'file_offset':start+field['offset']}
        return out
