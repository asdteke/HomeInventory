import type { LauncherTranslations } from '../i18n';

import { af } from './af';
import { am } from './am';
import { az } from './az';
import { be } from './be';
import { bn } from './bn';
import { bs } from './bs';
import { ca } from './ca';
import { ceb } from './ceb';
import { co } from './co';
import { cy } from './cy';
import { eo } from './eo';
import { et } from './et';
import { eu } from './eu';
import { fa } from './fa';
import { fil } from './fil';
import { fy } from './fy';
import { ga } from './ga';
import { gd } from './gd';
import { gl } from './gl';
import { gu } from './gu';
import { haw } from './haw';
import { hmn } from './hmn';
import { hr } from './hr';
import { ht } from './ht';
import { hy } from './hy';
import { ig } from './ig';
import { is } from './is';
import { jv } from './jv';
import { ka } from './ka';
import { kk } from './kk';
import { km } from './km';
import { kn } from './kn';
import { ku } from './ku';
import { ky } from './ky';
import { la } from './la';
import { lb } from './lb';
import { lo } from './lo';
import { lt } from './lt';
import { lv } from './lv';
import { mg } from './mg';
import { mi } from './mi';
import { mk } from './mk';
import { ml } from './ml';
import { mn } from './mn';
import { mr } from './mr';
import { mt } from './mt';
import { my } from './my';
import { ne } from './ne';
import { ny } from './ny';
import { or } from './or';
import { pa } from './pa';
import { ps } from './ps';
import { sd } from './sd';
import { si } from './si';
import { sk } from './sk';
import { sl } from './sl';
import { sn } from './sn';
import { so } from './so';
import { sq } from './sq';
import { sr } from './sr';
import { srCyrl } from './sr-Cyrl';
import { st } from './st';
import { sw } from './sw';
import { ta } from './ta';
import { te } from './te';
import { tg } from './tg';
import { ur } from './ur';
import { uz } from './uz';
import { yi } from './yi';
import { yo } from './yo';
import { zhHant } from './zh-Hant';
import { zu } from './zu';

/** Launcher translations for the remaining HomeInventory languages, keyed by language code.
 * zh-Hans is not included: reuse the Simplified Chinese ('zh') dictionary for it. */
export const extraDictionaries: Record<string, LauncherTranslations> = {
  'af': af, 'am': am, 'az': az, 'be': be, 'bn': bn, 'bs': bs, 'ca': ca, 'ceb': ceb, 'co': co, 'cy': cy, 'eo': eo, 'et': et, 'eu': eu, 'fa': fa, 'fil': fil, 'fy': fy, 'ga': ga, 'gd': gd, 'gl': gl, 'gu': gu, 'haw': haw, 'hmn': hmn, 'hr': hr, 'ht': ht, 'hy': hy, 'ig': ig, 'is': is, 'jv': jv, 'ka': ka, 'kk': kk, 'km': km, 'kn': kn, 'ku': ku, 'ky': ky, 'la': la, 'lb': lb, 'lo': lo, 'lt': lt, 'lv': lv, 'mg': mg, 'mi': mi, 'mk': mk, 'ml': ml, 'mn': mn, 'mr': mr, 'mt': mt, 'my': my, 'ne': ne, 'ny': ny, 'or': or, 'pa': pa, 'ps': ps, 'sd': sd, 'si': si, 'sk': sk, 'sl': sl, 'sn': sn, 'so': so, 'sq': sq, 'sr': sr, 'sr-Cyrl': srCyrl, 'st': st, 'sw': sw, 'ta': ta, 'te': te, 'tg': tg, 'ur': ur, 'uz': uz, 'yi': yi, 'yo': yo, 'zh-Hant': zhHant, 'zu': zu,
};

/** Right-to-left languages among the extra translations. */
export const EXTRA_RTL_LOCALES = ['fa', 'ur', 'ps', 'sd', 'yi'] as const;
