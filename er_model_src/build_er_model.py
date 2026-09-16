#!/usr/bin/env python3
"""Generates gymverse_er_model.xml: the GymVerse ER model in TerraER's native file format.

TerraER (github.com/rterrabh/TerraER) stores drawings as JHotDraw DOMStorable XML. The
figure element names come from DrawFigureFactory: ent / entfraca / entrel for the three
kinds of entity box, rel / relfraco for the two kinds of diamond, atr / atrchave /
atrchaveparcial / atrmulti / atrderivado for attributes, lcf for an attribute link and
llabelUm / llabelMuitos for a cardinality-labelled link. Attribute links are written as
lcf rather than the newer lcaf: both name the same class in TerraER 3.1+, but only lcf is
also understood by 2.2x and 3.0x, and the file then opens in every version from 2.23 on.

Two details are easy to get wrong and both break the file:
  * attributeType must be one of AttributeTypeEnum's five SQL strings. Anything else
    reads back as null and throws on the next save.
  * read() does not re-run a figure's init(), so every style init() would apply (the
    double stroke of a weak entity, the dashes of a derived attribute) has to be written
    into the file explicitly.

Run: python er_model_src/build_er_model.py
"""
from pathlib import Path

# --- TerraER's five attribute types (org.jhotdraw.enums.AttributeTypeEnum) -------------
CHAR, TEXT, INT, NUM, DATE = 'CHAR(128)', 'VARCHAR2(128)', 'NUMBER', 'NUMBER(9,2)', 'DATE'

# Attribute kinds: k=primary key, p=partial key (weak entities), s=simple,
# m=multivalued, d=derived.
ENTITIES = [
    # ---- identity and access ---------------------------------------------------------
    ('ROLE', 'ent', 2, 0, [
        ('role_id', 'k', INT), ('role_name', 's', TEXT), ('description', 's', TEXT)]),
    ('USER', 'ent', 3, 1, [
        ('user_id', 'k', INT), ('username', 's', TEXT), ('email', 's', TEXT),
        ('password_hash', 's', TEXT), ('is_active', 's', INT), ('status', 's', TEXT),
        ('last_login', 's', DATE), ('token_version', 's', INT),
        ('email_verified_at', 's', DATE)]),
    ('AUTH_TOKEN', 'entfraca', 4, 0, [
        ('token_hash', 'p', CHAR), ('purpose', 's', TEXT), ('expires_at', 's', DATE),
        ('used_at', 's', DATE)]),
    ('REVOKED_TOKEN', 'ent', 5, 0, [
        ('jti', 'k', TEXT), ('expires_at', 's', DATE), ('revoked_at', 's', DATE)]),
    ('AUDIT_LOG', 'ent', 6, 0, [
        ('audit_id', 'k', INT), ('action', 's', TEXT), ('table_name', 's', TEXT),
        ('record_id', 's', INT), ('old_data', 's', TEXT), ('new_data', 's', TEXT),
        ('ip_address', 's', TEXT), ('user_agent', 's', TEXT), ('created_at', 's', DATE)]),
    ('SYSTEM_SETTING', 'ent', 0, 0, [
        ('setting_id', 'k', INT), ('setting_key', 's', TEXT),
        ('setting_value', 's', TEXT), ('description', 's', TEXT)]),

    # ---- members, trainers, membership ------------------------------------------------
    ('MEMBER', 'ent', 3, 2, [
        ('member_id', 'k', INT), ('member_code', 's', TEXT), ('member_name', 's', TEXT),
        ('gender', 's', TEXT), ('date_of_birth', 's', DATE), ('phone', 's', TEXT),
        ('email', 's', TEXT), ('address', 's', TEXT),
        ('emergency_contact_name', 's', TEXT), ('emergency_contact_phone', 's', TEXT),
        ('join_date', 's', DATE), ('status', 's', TEXT),
        ('profile_photo_url', 's', TEXT)]),
    ('TRAINER', 'ent', 3, 4, [
        ('trainer_id', 'k', INT), ('trainer_code', 's', TEXT),
        ('trainer_name', 's', TEXT), ('phone', 's', TEXT), ('email', 's', TEXT),
        ('specialization', 's', TEXT), ('qualification', 's', TEXT),
        ('experience_years', 's', INT), ('bio', 's', TEXT), ('shift', 's', TEXT),
        ('status', 's', TEXT), ('profile_photo_url', 's', TEXT)]),
    ('MEMBERSHIP_PLAN', 'ent', 0, 1, [
        ('plan_id', 'k', INT), ('plan_name', 's', TEXT), ('description', 's', TEXT),
        ('duration_months', 's', INT), ('price', 's', NUM), ('access_level', 's', TEXT),
        ('personal_training_sessions', 's', INT), ('class_access', 's', INT),
        ('diet_consultation', 's', INT), ('status', 's', TEXT)]),
    ('SUBSCRIPTION', 'entrel', 1, 1, [
        ('subscription_id', 'k', INT), ('start_date', 's', DATE),
        ('end_date', 's', DATE), ('subscription_status', 's', TEXT),
        ('auto_renew', 's', INT), ('cancellation_date', 's', DATE),
        ('cancellation_reason', 's', TEXT)]),
    ('PAYMENT', 'entfraca', 0, 2, [
        ('receipt_number', 'p', TEXT), ('amount', 's', NUM),
        ('payment_date', 's', DATE), ('payment_method', 's', TEXT),
        ('payment_status', 's', TEXT), ('transaction_reference', 's', TEXT),
        ('notes', 's', TEXT)]),
    ('TRAINER_ASSIGNMENT', 'entrel', 3, 3, [
        ('assignment_id', 'k', INT), ('start_date', 's', DATE),
        ('end_date', 's', DATE), ('status', 's', TEXT), ('notes', 's', TEXT)]),

    # ---- activity ---------------------------------------------------------------------
    ('ATTENDANCE', 'entfraca', 2, 2, [
        ('attendance_date', 'p', DATE), ('check_in_time', 'p', TEXT),
        ('check_out_time', 's', TEXT), ('check_in_method', 's', TEXT),
        ('notes', 's', TEXT)]),
    ('PROGRESS_RECORD', 'entfraca', 5, 1, [
        ('recorded_date', 'p', DATE), ('weight', 's', NUM), ('height', 's', NUM),
        ('body_fat_percentage', 's', NUM), ('muscle_mass', 's', NUM),
        ('chest_measurement', 's', NUM), ('waist_measurement', 's', NUM),
        ('hip_measurement', 's', NUM), ('bmi', 'd', NUM), ('notes', 's', TEXT)]),
    ('FITNESS_GOAL', 'ent', 4, 1, [
        ('goal_id', 'k', INT), ('goal_type', 's', TEXT),
        ('starting_value', 's', NUM), ('current_value', 's', NUM),
        ('target_value', 's', NUM), ('unit', 's', TEXT), ('start_date', 's', DATE),
        ('target_date', 's', DATE), ('status', 's', TEXT), ('notes', 's', TEXT)]),
    ('NOTIFICATION', 'entfraca', 2, 1, [
        ('notification_date', 'p', DATE), ('notification_type', 's', TEXT),
        ('title', 's', TEXT), ('message', 's', TEXT), ('priority', 's', TEXT),
        ('read_status', 's', INT), ('read_at', 's', DATE)]),
    ('FEEDBACK', 'entfraca', 6, 1, [
        ('feedback_date', 'p', DATE), ('rating', 's', INT), ('category', 's', TEXT),
        ('comments', 's', TEXT), ('status', 's', TEXT)]),

    # ---- workouts ----------------------------------------------------------------------
    ('WORKOUT_PLAN', 'ent', 4, 4, [
        ('workout_plan_id', 'k', INT), ('plan_name', 's', TEXT),
        ('description', 's', TEXT), ('goal_type', 's', TEXT),
        ('difficulty_level', 's', TEXT), ('duration_weeks', 's', INT),
        ('status', 's', TEXT)]),
    ('EXERCISE', 'ent', 5, 5, [
        ('exercise_id', 'k', INT), ('exercise_name', 's', TEXT),
        ('description', 's', TEXT), ('muscle_group', 's', TEXT),
        ('secondary_muscle_group', 's', TEXT), ('equipment_required', 's', TEXT),
        ('difficulty_level', 's', TEXT), ('instructions', 's', TEXT),
        ('video_url', 's', TEXT), ('image_url', 's', TEXT),
        ('calories_per_minute', 's', NUM)]),
    ('WORKOUT_PLAN_EXERCISE', 'entrel', 4, 5, [
        ('workout_plan_exercise_id', 'k', INT), ('day_number', 's', INT),
        ('order_number', 's', INT), ('sets', 's', INT), ('repetitions', 's', INT),
        ('duration_seconds', 's', INT), ('weight', 's', NUM),
        ('rest_seconds', 's', INT), ('notes', 's', TEXT)]),
    ('MEMBER_WORKOUT', 'entrel', 4, 3, [
        ('member_workout_id', 'k', INT), ('assigned_date', 's', DATE),
        ('start_date', 's', DATE), ('end_date', 's', DATE), ('status', 's', TEXT),
        ('completion_percentage', 's', NUM), ('notes', 's', TEXT)]),
    ('WORKOUT_SESSION', 'entfraca', 4, 2, [
        ('session_date', 'p', DATE), ('duration_minutes', 's', INT),
        ('calories_burned', 's', NUM), ('completed', 's', INT), ('notes', 's', TEXT)]),

    # ---- classes -----------------------------------------------------------------------
    ('FITNESS_CLASS', 'ent', 6, 2, [
        ('class_id', 'k', INT), ('class_name', 's', TEXT), ('description', 's', TEXT),
        ('difficulty_level', 's', TEXT), ('duration_minutes', 's', INT),
        ('status', 's', TEXT)]),
    ('CLASS_SCHEDULE', 'entfraca', 6, 3, [
        ('class_date', 'p', DATE), ('start_time', 'p', TEXT), ('end_time', 's', TEXT),
        ('capacity', 's', INT), ('room', 's', TEXT), ('status', 's', TEXT),
        ('available_seats', 'd', INT)]),
    ('CLASS_BOOKING', 'entrel', 5, 2, [
        ('booking_id', 'k', INT), ('booking_date', 's', DATE),
        ('booking_status', 's', TEXT), ('attendance_status', 's', TEXT)]),

    # ---- diet and equipment -------------------------------------------------------------
    ('DIET_PLAN', 'ent', 1, 3, [
        ('diet_plan_id', 'k', INT), ('plan_name', 's', TEXT),
        ('daily_calories', 's', INT), ('daily_protein', 's', INT),
        ('daily_carbohydrates', 's', INT), ('daily_fats', 's', INT),
        ('start_date', 's', DATE), ('end_date', 's', DATE), ('status', 's', TEXT),
        ('notes', 's', TEXT)]),
    ('DIET_MEAL', 'entfraca', 1, 4, [
        ('meal_name', 'p', TEXT), ('meal_type', 's', TEXT),
        ('description', 's', TEXT), ('calories', 's', INT), ('protein', 's', INT),
        ('carbohydrates', 's', INT), ('fats', 's', INT), ('meal_time', 's', TEXT),
        ('notes', 's', TEXT)]),
    ('EQUIPMENT', 'ent', 0, 4, [
        ('equipment_id', 'k', INT), ('equipment_code', 's', TEXT),
        ('equipment_name', 's', TEXT), ('category', 's', TEXT), ('brand', 's', TEXT),
        ('model', 's', TEXT), ('purchase_date', 's', DATE),
        ('purchase_cost', 's', NUM), ('warranty_expiry', 's', DATE),
        ('equipment_condition', 's', TEXT), ('availability_status', 's', TEXT),
        ('location', 's', TEXT)]),
    ('MAINTENANCE_RECORD', 'entfraca', 0, 5, [
        ('maintenance_date', 'p', DATE), ('issue_description', 's', TEXT),
        ('maintenance_type', 's', TEXT), ('maintenance_cost', 's', NUM),
        ('technician_name', 's', TEXT), ('service_provider', 's', TEXT),
        ('next_service_date', 's', DATE), ('maintenance_status', 's', TEXT),
        ('notes', 's', TEXT)]),
]

# Diamonds: (name, kind, entity_1, label_1, entity_2, label_2). 'relfraco' is the double
# diamond that identifies a weak entity; label '1' draws llabelUm, anything else draws
# llabelMuitos carrying that text.
RELATIONSHIPS = [
    # identifying relationships of the weak entities
    ('ISSUES', 'relfraco', 'USER', '1', 'AUTH_TOKEN', 'N'),
    ('CHECKS_IN', 'relfraco', 'MEMBER', '1', 'ATTENDANCE', 'N'),
    ('MEASURED_BY', 'relfraco', 'MEMBER', '1', 'PROGRESS_RECORD', 'N'),
    ('RECEIVES', 'relfraco', 'MEMBER', '1', 'NOTIFICATION', 'N'),
    ('SUBMITS', 'relfraco', 'MEMBER', '1', 'FEEDBACK', 'N'),
    ('TRAINS_IN', 'relfraco', 'MEMBER', '1', 'WORKOUT_SESSION', 'N'),
    ('PAID_BY', 'relfraco', 'SUBSCRIPTION', '1', 'PAYMENT', 'N'),
    ('LISTS', 'relfraco', 'DIET_PLAN', '1', 'DIET_MEAL', 'N'),
    ('RUNS_AS', 'relfraco', 'FITNESS_CLASS', '1', 'CLASS_SCHEDULE', 'N'),
    ('SERVICED_BY', 'relfraco', 'EQUIPMENT', '1', 'MAINTENANCE_RECORD', 'N'),

    # ordinary relationships
    ('HAS_ROLE', 'rel', 'ROLE', '1', 'USER', 'N'),
    ('MEMBER_LOGIN', 'rel', 'MEMBER', '1', 'USER', '1'),
    ('TRAINER_LOGIN', 'rel', 'TRAINER', '1', 'USER', '1'),
    ('PERFORMS', 'rel', 'USER', '1', 'AUDIT_LOG', 'N'),
    ('SIGNS_OUT', 'rel', 'USER', '1', 'REVOKED_TOKEN', 'N'),
    ('SETS', 'rel', 'MEMBER', '1', 'FITNESS_GOAL', 'N'),
    ('FOLLOWS', 'rel', 'MEMBER', '1', 'DIET_PLAN', 'N'),
    ('PRESCRIBES', 'rel', 'TRAINER', '1', 'DIET_PLAN', 'N'),
    ('DESIGNS', 'rel', 'TRAINER', '1', 'WORKOUT_PLAN', 'N'),
    ('CONDUCTS', 'rel', 'TRAINER', '1', 'CLASS_SCHEDULE', 'N'),
    ('ASSIGNS', 'rel', 'TRAINER', '1', 'MEMBER_WORKOUT', 'N'),
    ('RATES_TRAINER', 'rel', 'TRAINER', '1', 'FEEDBACK', 'N'),
    ('RATES_CLASS', 'rel', 'FITNESS_CLASS', '1', 'FEEDBACK', 'N'),
    ('BASED_ON', 'rel', 'WORKOUT_PLAN', '1', 'WORKOUT_SESSION', 'N'),
]

# Associative entities carry the relationship themselves, so they connect straight to
# their two parents: (entrel, parent_1, label_1, parent_2, label_2).
ASSOCIATIONS = [
    ('SUBSCRIPTION', 'MEMBER', 'N', 'MEMBERSHIP_PLAN', 'M'),
    ('TRAINER_ASSIGNMENT', 'MEMBER', 'N', 'TRAINER', 'M'),
    ('MEMBER_WORKOUT', 'MEMBER', 'N', 'WORKOUT_PLAN', 'M'),
    ('WORKOUT_PLAN_EXERCISE', 'WORKOUT_PLAN', 'N', 'EXERCISE', 'M'),
    ('CLASS_BOOKING', 'MEMBER', 'N', 'CLASS_SCHEDULE', 'M'),
]

# --- layout ----------------------------------------------------------------------------
COL_W, ROW_H, X0, Y0 = 1500, 1000, 900, 650
BOX_W, BOX_H = 200, 66
DIA_W, DIA_H = 180, 80
ATTR_H = 40
ATTR_DX = (0, -240, 240, -480, 480)           # five slots per ring row, centre outwards
ATTR_DY = (-140, 140, -212, 212, -284, 284, -356, 356)
CHAR_W, TEXT_H = 7.0, 14.6                    # 12pt default font, measured from TerraER output


def attr_width(name):
    return max(140.0, CHAR_W * len(name) + 30.0)


def centre(col, row):
    return X0 + col * COL_W, Y0 + row * ROW_H


def chop(box, tx, ty):
    """Where the line from the centre of box towards (tx, ty) leaves the box."""
    x, y, w, h = box
    cx, cy = x + w / 2.0, y + h / 2.0
    dx, dy = tx - cx, ty - cy
    sx = abs(dx) / (w / 2.0) if dx else 0.0
    sy = abs(dy) / (h / 2.0) if dy else 0.0
    s = max(sx, sy)
    return (cx + dx / s, cy + dy / s) if s else (cx, cy)


def r(v):
    """Numbers the way JHotDraw writes them: no trailing .0 noise."""
    return '%g' % round(float(v), 4)


DOUBLE_STROKE = ('<strokeType><enum type="strokeType">DOUBLE</enum></strokeType>'
                 '<innerStrokeWidthFactor><double>3</double></innerStrokeWidthFactor>')
ATTR_FILL = '<fillColor><color rgba="#ffffebeb"/></fillColor>'
DASHED = '<strokeDashes><doubleArray><double>5</double></doubleArray></strokeDashes>'

ATTR_TAG = {'k': 'atrchave', 'p': 'atrchaveparcial', 's': 'atr',
            'm': 'atrmulti', 'd': 'atrderivado'}


class Doc:
    """Emits the figure XML and hands out the sequential hex ids TerraER uses."""

    def __init__(self):
        self.parts, self._id = [], 0

    def nid(self):
        self._id += 1
        return format(self._id - 1, 'x')

    def text(self, x, y, w, h, label, bold=False, underline=False, dashed=False):
        a = []
        if underline:
            a.append('<fontUnderlined><boolean>true</boolean></fontUnderlined>')
        if bold:
            a.append('<fontBold><boolean>true</boolean></fontBold>')
        if dashed:
            a.append('<strokeDashes><doubleArray><double>3</double></doubleArray></strokeDashes>')
        a.append('<text><string>%s</string></text>' % label)
        tx = x + (w - CHAR_W * len(label)) / 2.0
        ty = y + (h - TEXT_H) / 2.0
        return '<t id="%s" x="%s" y="%s"><a>%s</a></t>' % (self.nid(), r(tx), r(ty), ''.join(a))

    def shape(self, tag, x, y, w, h, attrs=''):
        return '<%s id="%s" x="%s" y="%s" w="%s" h="%s">%s</%s>' % (
            tag, self.nid(), r(x), r(y), r(w), r(h),
            '<a>%s</a>' % attrs if attrs else '', tag)

    def group(self, tag, inner, extra=''):
        gid = self.nid()
        self.parts.append('<%s id="%s"%s><children>%s</children></%s>'
                          % (tag, gid, extra, inner, tag))
        return gid

    def line(self, tag, p1, p2, start, end, label=None):
        pts = ''.join('<p colinear="true" x="%s" y="%s" c1x="0" c1y="0" c2x="0" c2y="0"/>'
                      % (r(px), r(py)) for px, py in (p1, p2))
        body = ['<points>%s</points>' % pts]
        for side, ref in (('startConnector', start), ('endConnector', end)):
            body.append('<%s><rConnector id="%s"><Owner><%s ref="%s"/></Owner></rConnector></%s>'
                        % (side, self.nid(), ref[1], ref[0], side))
        if label:
            body.append('<a><text><string>%s</string></text></a>' % label)
        self.parts.append('<%s id="%s">%s</%s>' % (tag, self.nid(), ''.join(body), tag))


def build():
    doc = Doc()
    boxes = {}      # entity name -> (figure id, tag, bounds)

    # entity boxes, each with its ring of attributes
    for name, tag, col, row, attrs in ENTITIES:
        cx, cy = centre(col, row)
        bx, by = cx - BOX_W / 2.0, cy - BOX_H / 2.0
        inner = doc.shape('r', bx, by, BOX_W, BOX_H, DOUBLE_STROKE if tag == 'entfraca' else '')
        if tag == 'entrel':
            # Associative entity: a diamond inscribed in the box. TerraER's own resize code
            # (TerraResizeEventFunctions) keeps both shapes on identical bounds, so match that.
            inner += doc.shape('diamond', bx, by, BOX_W, BOX_H)
        inner += doc.text(bx, by, BOX_W, BOX_H, name, bold=True)
        eid = doc.group(tag, inner)
        box = (bx, by, float(BOX_W), float(BOX_H))
        boxes[name] = (eid, tag, box)

        if len(attrs) > len(ATTR_DX) * len(ATTR_DY):
            raise SystemExit('%s: too many attributes for the ring layout' % name)
        for i, (aname, kind, sqltype) in enumerate(attrs):
            w = attr_width(aname)
            ax = cx + ATTR_DX[i % len(ATTR_DX)] - w / 2.0
            ay = cy + ATTR_DY[i // len(ATTR_DX)] - ATTR_H / 2.0
            style = ATTR_FILL + (DOUBLE_STROKE if kind == 'm' else '') + (DASHED if kind == 'd' else '')
            inner = doc.shape('e', ax, ay, w, ATTR_H, style)
            inner += doc.text(ax, ay, w, ATTR_H, aname,
                              bold=kind in ('k', 'p'), underline=kind == 'k', dashed=kind == 'p')
            aid = doc.group(ATTR_TAG[kind], inner,
                            ' nullable="false" attributeType="%s"' % sqltype)
            abox = (ax, ay, w, float(ATTR_H))
            doc.line('lcf', chop(abox, cx, cy), chop(box, ax + w / 2.0, ay + ATTR_H / 2.0),
                     (aid, ATTR_TAG[kind]), (eid, tag))

    # diamonds, placed in the free channel between the two entities they join
    taken = [b for _, _, b in boxes.values()]

    def free_spot(x, y):
        for dy in (0, -120, 120, -240, 240, -360, 360):
            for dx in (0, -200, 200, -400, 400):
                nx, ny = x + dx - DIA_W / 2.0, y + dy - DIA_H / 2.0
                clear = all(not (nx < bx + bw + 30 and nx + DIA_W + 30 > bx and
                                 ny < by + bh + 30 and ny + DIA_H + 30 > by)
                            for bx, by, bw, bh in taken)
                if clear:
                    return nx, ny
        return x - DIA_W / 2.0, y - DIA_H / 2.0

    for name, tag, e1, l1, e2, l2 in RELATIONSHIPS:
        b1, b2 = boxes[e1][2], boxes[e2][2]
        c1 = (b1[0] + b1[2] / 2.0, b1[1] + b1[3] / 2.0)
        c2 = (b2[0] + b2[2] / 2.0, b2[1] + b2[3] / 2.0)
        mx, my = (c1[0] + c2[0]) / 2.0, (c1[1] + c2[1]) / 2.0
        if abs(c1[0] - c2[0]) < 1:               # same column: use the side channel
            mx += COL_W * 0.5 if c1[0] < X0 + 5 * COL_W else -COL_W * 0.5
        dx, dy = free_spot(mx, my)
        taken.append((dx, dy, float(DIA_W), float(DIA_H)))
        inner = doc.shape('diamond', dx, dy, DIA_W, DIA_H,
                          DOUBLE_STROKE if tag == 'relfraco' else '')
        inner += doc.text(dx, dy, DIA_W, DIA_H, name)
        rid = doc.group(tag, inner)
        dbox = (dx, dy, float(DIA_W), float(DIA_H))
        dcentre = (dx + DIA_W / 2.0, dy + DIA_H / 2.0)
        for ent, label in ((e1, l1), (e2, l2)):
            eid, etag, ebox = boxes[ent]
            ec = (ebox[0] + ebox[2] / 2.0, ebox[1] + ebox[3] / 2.0)
            doc.line('llabelUm' if label == '1' else 'llabelMuitos',
                     chop(dbox, *ec), chop(ebox, *dcentre),
                     (rid, tag), (eid, etag), None if label == '1' else label)

    # associative entities carry their own diamond, so they connect straight to the parents
    for assoc, p1, l1, p2, l2 in ASSOCIATIONS:
        aid, atag, abox = boxes[assoc]
        ac = (abox[0] + abox[2] / 2.0, abox[1] + abox[3] / 2.0)
        for parent, label in ((p1, l1), (p2, l2)):
            pid, ptag, pbox = boxes[parent]
            pc = (pbox[0] + pbox[2] / 2.0, pbox[1] + pbox[3] / 2.0)
            doc.line('llabelUm' if label == '1' else 'llabelMuitos',
                     chop(abox, *pc), chop(pbox, *ac),
                     (aid, atag), (pid, ptag), None if label == '1' else label)

    return '<drawing><figures>%s</figures></drawing>' % ''.join(doc.parts)


if __name__ == '__main__':
    out = Path(__file__).resolve().parent.parent / 'gymverse_er_model.xml'
    out.write_text(build(), encoding='utf-8')
    kinds = [e[1] for e in ENTITIES]
    print('%s: %d entities (%d strong, %d weak, %d associative), '
          '%d relationships, %d attributes'
          % (out.name, len(ENTITIES), kinds.count('ent'), kinds.count('entfraca'),
             kinds.count('entrel'), len(RELATIONSHIPS) + len(ASSOCIATIONS),
             sum(len(e[4]) for e in ENTITIES)))
