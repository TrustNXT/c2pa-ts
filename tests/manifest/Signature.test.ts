import assert from 'node:assert/strict';
import * as bin from 'typed-binary';
import { CBORBox, SuperBox } from '../../src/jumbf';
import { Signature } from '../../src/manifest';
import * as raw from '../../src/manifest/rawTypes';
import { BinaryHelper } from '../../src/util';

describe('Signature Tests', function () {
    this.timeout(0);

    // claim data taken from adobe-20220124-C.jpg
    const serializedString =
        '000046b86a756d62000000286a756d646332637300110010800000aa00389b7103633270612e7369676e6174757265000000468863626f72d28444a1013824a3677835636861696e835906b4308206b030820464a00302010202147e3e629adccfe7d99710135b5a48056972df8199304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a20302012030818c310b3009060355040613025553310b300906035504080c0243413112301006035504070c09536f6d65776865726531273025060355040a0c1e43325041205465737420496e7465726d65646961746520526f6f7420434131193017060355040b0c10464f522054455354494e475f4f4e4c593118301606035504030c0f496e7465726d656469617465204341301e170d3232303631303138343632385a170d3330303832363138343632385a308180310b3009060355040613025553310b300906035504080c0243413112301006035504070c09536f6d657768657265311f301d060355040a0c16433250412054657374205369676e696e67204365727431193017060355040b0c10464f522054455354494e475f4f4e4c593114301206035504030c0b43325041205369676e657230820256304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201200382020f003082020a0282020100eb62352581a4a9072fbf24843615d874d89155264eee5d827db41a25233a35a103258ae6e64bfa2b875a61d43aad31a82dfd47e87268c91c20051ffd770944ae34261d6cda4278fa40a4efe441d67d717997898eb2a127bcc20e11fa78556a3bd3a6de985ca59c8ab74d720e485f20ff791b30882ee3e6e652ca608dcfd059a90bcce5e5cb5ebe01b54d725c5fc6cd53a7ec1e69b0d2b06b55750e47e37530e14efe1fbe9b122184b5bad355eb818bba94340320339cfc8c70cc4a7cf920332f7bfa352b4111822ad9df9a95480450038cf04cd9b2e9e0b34768bcc3c671fc3b08eb06e31add98b1c4c516aee04d60d4035f87642c61dada34cb52ff07292353c6e8192a510e3394ca0efc22369d9e689e29dbb8bf71fd426df9ae95bc70347b86d321c24956adffb7af66a59b4d7ba5aa0df194f8a2d9e4725204d496f4ac96c5201416e0c500cb4a6516664c1a272874a362562d4fefd637b9ff2e0149d846313de15c1863eb56a453c37f20d1003c73215ec077d005952248a76f311075ce6223fbd9e662c87c81a9c9cee3da520b063552a8389647abe61addec018f0b2547dd6442d106ab8dcf442bf1e157feaa25de302ccaf8bd46834bfe8edf3482bcfecbc0a1e7f124c62b5a1ff7a2fc74491b2bc366eeefad5e9f6d62df5b2b01a054ad1d68ab41ca1c6031ac166f6187b6f033e5b4aaf341fe16d1434c5facc23d0203010001a3783076300c0603551d130101ff0402300030160603551d250101ff040c300a06082b06010505070304300e0603551d0f0101ff0404030206c0301d0603551d0e041604143728752d9f2c4325c57d9dc02edfbb2a977685ee301f0603551d230418301680140c3280cae5966d4f1ffbf90b01d6a9e50cdc00e2304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201200382020100098166e6ce8e70972189a0da5d690d81fe5c8ca9e5f79ac99cfa361833eb107b0a8b8d82f7239185bb11aa8d46e1240095890baf0e9e3330c1eead5d6402e227cc29b560f1a8ff21169502a9042ff31143cf4b9cbf45f401b17ae809ba562da6acc538950a08fc5c5c61283f2aa363bb8c7534b5e09ce5b8a530b62419026e2d73087f65d464b7af62df046a571218d932b49dcbebe0df5c5f5ca53ba9be1b1b9fb1e1523b437010cc63a2725cbecc45c2307c785521134c87de974382a136cd87eff648d89051a782d3aa6c27b68b144ce688fdaa84be68a55d3a2f66fe039b7099125bd2580090f61872cec8ba46591860e319e7d6cee7d96f69581efeb71351edaaa4ad43616507739cd55d59118e6a57b8b8725148f6407ad413a18a15032217d5b6b52ff191a39da638e4faec0261988555249155bccbef25e43c92d5bc1a5c588c6f471db4691344b51efec584e834bc402acab29c627e49598180bc4af456a52a04fcf7fd067c81b989c178a79d492ed5065b199508145212dcc0da3d73169a9d8ab8d3312571c4d427da883ef29f6a65315e5065a91d7b7f8a7e8eaabf618848af966219c664063f2f1b443aac15ad0a434152798e047f44a3c8b0ea1b75ba11fda4d58e5a7b38e7ef2f1154bc3ebacce8956bde9f02c7f096d5360a9d2e59d40a48ba24b664162d88047b740eaaf80b0de60fd92700766f92fa51d55906953082069130820445a00302010202147939fdd16180930d9f3891c1357e8486707b159e304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201203077310b3009060355040613025553310b300906035504080c0243413112301006035504070c09536f6d657768657265311a3018060355040a0c1143325041205465737420526f6f7420434131193017060355040b0c10464f522054455354494e475f4f4e4c593110300e06035504030c07526f6f74204341301e170d3232303631303138343632365a170d3330303832373138343632365a30818c310b3009060355040613025553310b300906035504080c0243413112301006035504070c09536f6d65776865726531273025060355040a0c1e43325041205465737420496e7465726d65646961746520526f6f7420434131193017060355040b0c10464f522054455354494e475f4f4e4c593118301606035504030c0f496e7465726d65646961746520434130820256304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201200382020f003082020a0282020100aa569f92b3240e89b84851d0046c2a3839ee8fec62ec8a02c400ec2acf6b0e3bc407ba8ad9c8ff77bb06869e01bc24eee88fb6c5499fcfecaf27fef6f879d0be85062273e9f116ef6f54f72dc7f20dc638587a89a2e28d19ae13e1954dbb71dd81b683fd2dc1487981259bd9e981f4a560e7b5b36b6b5591d0a7c2b00fa371c3df088dcd4d50a31271654d274751ab092e787db4cbde7e4d500d4a7798d777c7b5f5156219aae5ce807c433554be1830d67d2376d1dc32203be8b6578de5b39341bdcfce08340ff67129bff5a224602097df4df44e2139d4d0c937814c0bcde407697c0a0d1e03215b2dec68ad038c8822af315c3bf22a561d7ba791635255fc7d111314f146009c5ca42b36b52620fa054aecf4e5369d43ddc0d009eb11a3c939a636d262651dae9b2d279c15aff25b58527ffa0d2a48eab4818d57c93a7ce7dd3ba8ff664c51508d7d21ca982f2fc87b03053aea3024f6b2f0b0a8334c6a23bff28f582f7e4ca397ac07b89df67b5ee48f5c279946e0fe7be68efa79b0f6632292172667849b6ab0bf03ad04937c105488e1e99e20ed8d56d412e75451a276b358db8744a7ff869097b09a48b276611f7984a900302aea1b0e12fef6936745a83cb2c0862d998b181d177d216e7cca79fe04326588f843ac1487f3883bfd59613b503e59c72f2141548986942c6f3220ee876b9eee5632acdb8dc03297308f0203010001a3633061300f0603551d130101ff040530030101ff300e0603551d0f0101ff040403020186301d0603551d0e041604140c3280cae5966d4f1ffbf90b01d6a9e50cdc00e2301f0603551d23041830168014456f1be2742e66022d792c39f9fa324d942b1950304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201200382020100aa46045093f50492d8e7907b3564e1677d428938849c05324773ba17630159f5ccad8100206dfebf34292db6c0876bbfdd6e2dcc388bafdb92eca03dcfaaeec1438380008c00767b91f4ff65edd74a685ecd85599b77386ff1742bf77dd860c0ce382574188a22456a4eb452accca30b2c89fa447854e5b3f04a05bddc2faddd123fed65f55e53865987cd0ddc5d3d693290a38fe6f0d73ed27198d8740a2d3a4ef88e34571796341d8ada6c687ab65d2c9fa597b1864adbb2ee43f88f26b5cb56ab7ff8128762da83ef7fba761f0fa971b5a173bd2a810ec09a6df11f48c06a008f7ee1169bd99b64e167a4ca5ccd3e1e907265a984c680a22f69905916ca58f4b22631705e32d2716481209835798e39f9adc03b086e484df86a5870a281f6a8312e18aeca5b55b957fd368edb1b61cdaea447e433377601a25bd802c3182c1ae0683a22411a74d05d5ef35ec06d5d1433ce80f88933d81319e5cc10b3bdb01a683af66ca158f6c1b542fb91459ea9b8d1b3f2d33791f7d0868e064132be2c8822d12726c10fcb17eac134592c7cf7a4343e545d4b85a78aef98f10092dbdded0320fbb56ced928e6675519f71861f6b65271ea2a50d93a974cabfae3cd7b4f55112af9d44a95ddca2f2a2a899898edc7943d3ada010de92b9df975c5f75c0ee9f51b06cedca5ee399ae873b65a63bd6baac6476c42a96e7f83dc2fab4dec059067f3082067b3082042fa00302010202140c01b9fac7c6b29a6b5fe865927d52b81d9fe554304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201203077310b3009060355040613025553310b300906035504080c0243413112301006035504070c09536f6d657768657265311a3018060355040a0c1143325041205465737420526f6f7420434131193017060355040b0c10464f522054455354494e475f4f4e4c593110300e06035504030c07526f6f74204341301e170d3232303631303138343632355a170d3332303630373138343632355a3077310b3009060355040613025553310b300906035504080c0243413112301006035504070c09536f6d657768657265311a3018060355040a0c1143325041205465737420526f6f7420434131193017060355040b0c10464f522054455354494e475f4f4e4c593110300e06035504030c07526f6f7420434130820256304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201200382020f003082020a0282020100b8ab7b77dbb1d11c3b3b63d351f99a9eae7c146d9d44884051f2f29367d4ad5e649f9338129ef55fb056a7beb2ae66f1485aaf74f6dfe01f6cf492523666d0a1c0b8ba4c5617423cd0b7ec790a945c7569c1f737d484ea5d50702145dd37435e07d8cc80888f7c9aa715ade40e88b0f276584f0e56bb2209f83ea79d5c11fe37050211c6d0204af62ef919e5fcd7d46cc1b6aca60a54ff1aacfbe553bbcccd6857882a1251472ec4cb833bf93d1ee9c9d7076aea13bc55a164d833e6cde8957243286fe7de1d0cdef22c8e7d7539791cc2af7d35ee4d9bd02ddad0b5c341eebb88957724cb34b2007ccdfaf28a247fb08978dad526e61d111c0bc080a97ad62f3a789d5532d20edfd82b5df5a51df65c29331a7ac8bae6019bf93a21880da16a948688c625a8baa39848d68740cc5216afd4f4b1af5feba3fa44a978494a9affd03fb924bc071d6049b4cf06bb8e566e8828c6d166448d37f3bc7600dad4e7ed6021c36e5082421f43b4e4a1ea3969f48ea2394aee2e5b3b778c0f0ebb2d3de7e2d0fbb0b1f58083837306d437b8677397f966caeb2aea0f7815556ae115c737fe1025c8ad13d54fa7356e3f8d5a2965513375ffab5d481fcd2bb5a110b79e10309c22b08bf8784616dd3618f6242dabb43b1fd99ccfad02949198409bddd4347b940f4bb54ae7409223358f6fe8eb87557117105a031f4be2adaada1e8ccc770203010001a3633061301d0603551d0e04160414456f1be2742e66022d792c39f9fa324d942b1950301f0603551d23041830168014456f1be2742e66022d792c39f9fa324d942b1950300f0603551d130101ff040530030101ff300e0603551d0f0101ff040403020186304106092a864886f70d01010a3034a00f300d06096086480165030402010500a11c301a06092a864886f70d010108300d06096086480165030402010500a2030201200382020100415a750e1bf11e4288ac802f7ae07e7e9ece120c86053ac35e92c24cdd601dd321b62f70848d492c518ba0433079860878069b3139a8eb90a211c5737dee182fa16c1b03b6b24861cb81fa87d6fb0689b3a5039b6f4505f45a843e18c9ee96254ca4b8e91dd604db5e3c0df81a0f22251a71e973881c5e5ed81c361cbd337d355e58e0fe31ff65bf2e1d75342fd539233d693fa39c513bb3b56889155f30dda25acb21d9a8a179c744f6bb36c3e5adfc4fec0ab542942435c5a00ed7e8b8fa60526bb856fbd96b40a4b1d9b37d73c2bf0b25e001c52dbad708879ae02e6d9458e681f48b778b0d0d55ac70c808165c2f45a9826c9e26b80f700fd1324be0f6e9354680e1fd87efa34e0edca731f1285d2a06dd3618a4e60a67ae65672de66f6eb07ef05fae501224c0a5a9d8841477c684ffdd4c067d782d9c7f8d22637b5af38a922726d2627aacb7c55bfc69fe75823da909b4c951ed26dbe46d9b6004ae5583a7f9abb23b0e15483502545655b3468ebf571fbf541cf9b42e5a54376ab4102caba65c612e74102bcafe81a75718e978e69f1af695d94ae86681b2ee9edb128261a8e3eb5b6c99e0954da7d2ba082460cd1ea314dfe051ee363f594839f7232d900cd461e2c6d8cfe602c0a7ab094bc5f4e4ef3141106d9ceb04c0d2e3e70d3230076dc00cd3fd57efedbd3ca9fc7815f40f166b63bddbb8b3cda035ab714866736967547374a169747374546f6b656e7381a16376616c59173f3082173b30030201003082173206092a864886f70d010702a08217233082171f020103310f300d06096086480165030402010500308183060b2a864886f70d0109100104a0740472307002010106096086480186fd6c07013031300d0609608648016503040201050004200432594d249ca8418b0fcf6b3f7f65d18b92a20fcac5f7f031b9005f7615a82302110086b091f8b163977b2b98cdc2a02d7b0f180f32303233303132343134343835365a02090090c0ff57de1168f8a0821307308206c0308204a8a00302010202100c4d69724b94fa3c2a4a3d2907803d5a300d06092a864886f70d01010b05003063310b300906035504061302555331173015060355040a130e44696769436572742c20496e632e313b303906035504031332446967694365727420547275737465642047342052534134303936205348413235362054696d655374616d70696e67204341301e170d3232303932313030303030305a170d3333313132313233353935395a3046310b30090603550406130255533111300f060355040a13084469676943657274312430220603550403131b44696769436572742054696d657374616d702032303232202d203230820222300d06092a864886f70d01010105000382020f003082020a0282020100cfeca5263ac6a9f26bbb8dc10d9adba1e8148574331a26acd01c551e1e366dbc92550c61f49d09773d1596082f6b64a4fd068316d79192381c310296fb72b1973a55af33ec618ae9a628db90635cbd8953e03a2d8c8742ae26a4e4bb7878b97a16e156c6c0ba6453bb2a16e75048bb88690c88c6f1bee02f7d3bb1ca538d40831ee7cb7249281e4c801e8556e785edf261bcaa3a077df6ab6ee566dde25cf52fed8dd44d958468e380cb6a79d1d210914629eb3e26f2b48ccd4cb966c8bbaa50380de58c945d195abff57b406e6f16a89a9c95478685793e0c5e668c1a0a24be9caad29cb6f74f6e78c4283fa31c0f500637ba08d935a6b51eda78581d39e8f84c9110967e4de1ddc2ada57ef82d1b1fec2b4618a319f639f7f5c14f712e890311a24bbb98bffa4fe47b36ef0644e455ff36eae57c31e7f3c252c4e6167b5a7ea52573dbc06a99212d63e559f54d2f901f27b7d2ab14e538668751086bfb534339d064fa56cfe0f40ae6146d6478bb98fd94c37321f32fc22e20d781acd3f107d4e1bdd95d4b6e3194298be641a46594c058e5e52e2990a6b76164fad9206c185160baa6810f092553f1bf3be9ab070e6a07396219c9d6857f13d98d79cf62c5ece17bb9cc6713079ac178edc688c8b06e3279c70b59838dc6eef52c7c7b8ecb6489f1b1c4b8e7535e5f55d27d192959034efa5dea45731c847ed7cee2d43a770203010001a382018b30820187300e0603551d0f0101ff040403020780300c0603551d130101ff0402300030160603551d250101ff040c300a06082b0601050507030830200603551d20041930173008060667810c010402300b06096086480186fd6c0701301f0603551d23041830168014ba16d96d4d852f7329769a2f758c6a208f9ec86f301d0603551d0e04160414628aded061fc8f3114ed970bcd3d2a9414df529c305a0603551d1f04533051304fa04da04b8649687474703a2f2f63726c332e64696769636572742e636f6d2f44696769436572745472757374656447345253413430393653484132353654696d655374616d70696e6743412e63726c30819006082b06010505070101048183308180302406082b060105050730018618687474703a2f2f6f6373702e64696769636572742e636f6d305806082b06010505073002864c687474703a2f2f636163657274732e64696769636572742e636f6d2f44696769436572745472757374656447345253413430393653484132353654696d655374616d70696e6743412e637274300d06092a864886f70d01010b0500038202010055aa2a1af346f378573730fc75e34fd68523f1fcf995399b25e6f7728a98c377d464fc15fb36c249512c7888635509463900fc69d4ca9b29fba33fc0c9009b131db09889dc78f2cd7c85cd539daf62e26166a3142a45874a98422b50fc1bb59e083009fae42dd7098979f909e688ce7d1bb86aa29bc1536009e8a3b89dd7ad1f1cb8ec9841f0f60e80fbe4ffdf9d10a7eb00ba5f4a8f1a3a52b4eabf0949153536599a0f54d2b21b7f7e5e09ad76548a746dcad205672b76ebff98b226953819884414e50a59a26be7223e4421d23f1cc09bed7c48b2d8920c914f3c6694af5d0253eb9ee29ee4d31f8601649c00c2e95a74750d3de17988bf1c0197c9192380d7365a5f9616b1630cc646403bce5d35d4593e439a18aec3c9cbc3fb9b135f6ab5c7e0f305c359df27622bde41c953b9ff341067f62632987bfe5c42948194829dac0a8bc64b154ad3989045603380e023def803a4f64547e5ceb8034247e841367177adfda2e897744e2eda1e1d8c5ac81e9ad5c2f0c622a84f9bbdd81c9a51c42f9af65fa72797ba962e8557c060e778567f6aefc2959a4b1102c8829cc91a057cba71b54e7a996cf4e89ed45a98c89fbf8dbb185c43f5d02ae8e262ee7804dbbdd1fb5b0aa8707ef0978478e308035d472c63a825389701d23f3adae5e5f6e69bdc7e2cccff174c4d00a2d8d6010eb88beee6e07255892c271961f677018c308206ae30820496a0030201020210073637b724547cd847acfd28662a5e5b300d06092a864886f70d01010b05003062310b300906035504061302555331153013060355040a130c446967694365727420496e6331193017060355040b13107777772e64696769636572742e636f6d3121301f060355040313184469676943657274205472757374656420526f6f74204734301e170d3232303332333030303030305a170d3337303332323233353935395a3063310b300906035504061302555331173015060355040a130e44696769436572742c20496e632e313b303906035504031332446967694365727420547275737465642047342052534134303936205348413235362054696d655374616d70696e6720434130820222300d06092a864886f70d01010105000382020f003082020a0282020100c686350649b3c13d72495155c72503c4f29137a99751a1d6d283d19e4ca26da0b0cc83f95af611a14415425fa488f368fa7df39c890b7f9d1f9e0f331f50130b2673966df857a8027dfd43b484da11f173b1b3ee2b80848a2218dfebda3dc4177fab192b3e42dc678eea513df0d656d4e7282debd3b1b575e71f06658d9429d3d9ec69dfd9908746007bdb444189dc7c6a577af037799f5daccbe88464b452f27647f7618319dd5fb4540b21686e3721bb40ac5fb2de4a7dcef5391267ef0ea5636ce4a6c51dcd360d5cd5e61ba8c1647440a7c072c5ba4e1fb1b5584d79fed78f7393ac2c39e2a548d6f0b03113a9572996272ef587a68f4e761555267098267fa01a472043e34363807b756e272590983a3811b3f6f69ee63b5bec81de2214d9822ac792bfa0dee33ea273fae71f5a6c94f25295112b58744028ab7343cedf4aa11c6b38c529f3caaa967342689fb646b39d3aa3d503e0bff0a23cca42dc18487f1434cfd24cabef9b3dfe0eb8642afa75282441ed42bf059c66495250f451f336494d8b20d22c5735792ba8f34560bc238d58f7dc61de93fe39c0f9b230a54cd7e9984a583ed30388feb38fd35e4b76125193c98c0c3b5b8a22a8c12608f9141012037d5f23bb64e363e0a6e13ef6c274b23f1e0976ecab5d4675e260a358090128000e8454eecee95dc85e3012bd469eb5d376b9d20e6b990cd233b4cdb10203010001a382015d3082015930120603551d130101ff040830060101ff020100301d0603551d0e04160414ba16d96d4d852f7329769a2f758c6a208f9ec86f301f0603551d23041830168014ecd7e382d2715d644cdf2e673fe7ba98ae1c0f4f300e0603551d0f0101ff04040302018630130603551d25040c300a06082b06010505070308307706082b06010505070101046b3069302406082b060105050730018618687474703a2f2f6f6373702e64696769636572742e636f6d304106082b060105050730028635687474703a2f2f636163657274732e64696769636572742e636f6d2f446967694365727454727573746564526f6f7447342e63727430430603551d1f043c303a3038a036a0348632687474703a2f2f63726c332e64696769636572742e636f6d2f446967694365727454727573746564526f6f7447342e63726c30200603551d20041930173008060667810c010402300b06096086480186fd6c0701300d06092a864886f70d01010b050003820201007d598ec093b66f98a94422017e66d6d82142e1b0182e104d13cf3053cebf18fbc7505de24b29fb708a0daa2969fc69c1cf1d07e93e60c8d80be55c5bd76d87fa842025343167cdb612966fc4504c621d0c0882a816bda956cf15738d012225ce95693f4777fb727414d7ffab4f8a2c7aab85cd435fed60b6aa4f91669e2c9ee08aace5fd8cbc6426876c92bd9d7cd0700a7cefa8bc754fba5af7a910b25de9ff285489f0d58a717665daccf072a323fac0278244ae99271bab241e26c1b7de2aebf69eb1799981a35686ab0a45c9dfc48da0e798fbfba69d72afc4c7c1c16a71d9c6138009c4b69fcd878724bb4fa349b9776691f1729ce94b0252a7377e9353ac3b1d08490f94cd397addff256399272c3d3f6ba7f166c341cd4fb6409b212140d0b71324cddc1d783ae49eade5347192d7266be43873aba6014fbd3f3b78ad4cadfbc4957bed0a5f33398741787a38e99ce1dd23fd1d28d3c7f9e8f1985ffb2bd87ef2469d752c1e272c26db6f157b1e198b36b893d4e6f2179959ca70f037bf9800df20164f27fb606716a166badd55c03a2986b098a02bed9541b73ad5159831b462090f0abd81d913febfa4d1f357d9bc04fa82de32df0489f000cd5dc2f9d0237f000be4760226d9f0657642a6298709472be67f1aa4850ffc9896f655542b1f80fac0f20e2be5d6fba92f44154ae7130e1ddb37381aa12bf6edd67cfc3082058d30820475a00302010202100e9b188ef9d02de7efdb50e20840185a300d06092a864886f70d01010c05003065310b300906035504061302555331153013060355040a130c446967694365727420496e6331193017060355040b13107777772e64696769636572742e636f6d312430220603550403131b4469676943657274204173737572656420494420526f6f74204341301e170d3232303830313030303030305a170d3331313130393233353935395a3062310b300906035504061302555331153013060355040a130c446967694365727420496e6331193017060355040b13107777772e64696769636572742e636f6d3121301f060355040313184469676943657274205472757374656420526f6f7420473430820222300d06092a864886f70d01010105000382020f003082020a0282020100bfe6907368debbe45d4a3c3022306933ecc2a7252ec9213df28ad859c2e129a73d58ab769acdae7b1b840dc4301ff31ba43816eb56c6976d1dabb279f2ca11d2e45fd6053c520f521fc69e15a57ebe9fa95716595572af689370c2b2ba75996a733294d11044102edf82f30784e6743b6d71e22d0c1bee20d5c9201d63292dceec5e4ec893f821619b34eb05c65eec5b1abcebc9cfcdac34405fb17a66ee77c848a86657579f54588e0c2bb74fa730d956eeca7b5de3adc94f5ee535e731cbda935edc8e8f80dab69198409079c378c7b6b1c4b56a183803108dd8d437a42e057d88f5823e109170ab55824132d7db04732a6e91017c214cd4bcae1b03755d7866d93a31449a3340bf08d75a49a4c2e6a9a067dda427bca14f39b5115817f7245c468f64f7c169887698763d595d4276878997697a48f0e0a2121b669a74cade4b1ee70e63aee6d4ef92923a9e3ddc00e4452589b69a44192b7ec094b4d2616deb33d9c5df4b0400cc7d1c95c38ff721b2b211b7bb7ff2d58c702c4160aab1631844951a76627ef680b0fbe864a633d18907e1bdb7e643a418b8a67701e10f940c211db2542925896ce50e52514774be26acb64175de7aac5f8d3fc9bcd34111125be51050eb31c5ca72162209df7c4c753f63ec215fc420516b6fb1ab868b4fc2d6455f9d20fca11ec5c08fa2b17e0a2699f5e4692f981d2df5d9a9b21de51b0203010001a382013a30820136300f0603551d130101ff040530030101ff301d0603551d0e04160414ecd7e382d2715d644cdf2e673fe7ba98ae1c0f4f301f0603551d2304183016801445eba2aff492cb82312d518ba7a7219df36dc80f300e0603551d0f0101ff040403020186307906082b06010505070101046d306b302406082b060105050730018618687474703a2f2f6f6373702e64696769636572742e636f6d304306082b060105050730028637687474703a2f2f636163657274732e64696769636572742e636f6d2f4469676943657274417373757265644944526f6f7443412e63727430450603551d1f043e303c303aa038a0368634687474703a2f2f63726c332e64696769636572742e636f6d2f4469676943657274417373757265644944526f6f7443412e63726c30110603551d20040a300830060604551d2000300d06092a864886f70d01010c0500038201010070a0bf435c55e7385fa0a3741b3db616d7f7bf5707bd9aaca1872cec855ea91abb22f8871a695422eda488776dbd1a14f4134a7a2f2db738eff4ff80b9f8a1f7f272de24bc5203c84ed02adefa2d56cff9f4f7ac307a9a8bb25ed4cfd143449b4321eb9672a148b499cb9d4fa7060313772744d4e77fe859a8f0bf2f0ba6e9f2343cecf703c787a8d24c401935466a6954b0b8a1568eeca4d53de8b1dcfd1cd8f4775a5c548c6fefa1503dfc760968849f6fcadb208d35601c0203cb20b0ac58a00e4063c59822c1b259f5556bcf27ab6c76ce6f232df47e716a236b22ff12b8542d277ed83ad9f0b68796fd5bd15cac18c34d9f73b701a99f57aa5e28e2b994318203763082037202010130773063310b300906035504061302555331173015060355040a130e44696769436572742c20496e632e313b303906035504031332446967694365727420547275737465642047342052534134303936205348413235362054696d655374616d70696e6720434102100c4d69724b94fa3c2a4a3d2907803d5a300d06096086480165030402010500a081d1301a06092a864886f70d010903310d060b2a864886f70d0109100104301c06092a864886f70d010905310f170d3233303132343134343835365a302b060b2a864886f70d010910020c311c301a301830160414f387224d8633829235a994bcbd8f96e9fe1c7c73302f06092a864886f70d01090431220420d6a20e02248e662915b1718e5172c37b11ee27e97d7f94aa478911750f39315c3037060b2a864886f70d010910022f31283026302430220420c7f4e1be32288920abe2263abe1ac4fc4fe6781c2d64d04c807557a023b5b6fa300d06092a864886f70d01010105000482020022963e82f696f731d81f89e5069d3a9b57ca871bff5d304bc6bfc5264d35f3339a343d8172c270673f4683b52f9c754ca04d96fc06fae8b76ad89e32e27ecd04e105d7c1dca66767015283600ee384d0ed27c7526e29f13e7eaa5abbe13bd0519aec9438ce2243ed1487c4ee0b4a4b0e797961b5acfed943e179bb12a46dabf62f3214acd6374327e51308bed9224ffd689a2745667c5e7bd41a92ffde6b17f146de57eb7842f90db9f6bbbd145d9922d85b9e6d2b96dd90d4dc336936e91055b0e99e62fe2c0403c002676a367e81e6dfb4be41c04ee707206b26df0b8f54fc1595db77ea60e5f5d2a40daff8b8b761c1bc043ee657503972a74fe1c188cc33044936d88655488d12bdc76ee13f51e33c6387831aae4f3b7a3862d3924a5734d3de1b4fa021e1aefaf222530e0cb7daf68c3d06d494372565f1c7d395a7fde5deaa72f744ba8b11f9afc93a5d78e8752ca7543739ef6c70f53e8bd43b69064fc2f7b0ac2322564445569529557bc2f7be13dcf52bc5c28b72a7dd480824c08c734b0944c9e6c9fdcad27f181c439aeeb545b74084b1f533b52ae65cd2faf2e70d19a76e05cb86547ae4663d3ec03601362f4ed3c00e5d37e64cd40355e16952f9cfffc669714cdde8cd0d6d74ae547f59e9d2ef469c94908ecd2d2be4adbdac9068c9abf599851cbe5d9f3ddc0f34d342b5fe2bbe0400f93f7e2cdc974443fb6370616459193900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f6590200b129255d409abf6f591d0ab53eb162c216464be460b7d2271aedbc1466d945e49cf9e1e9859bfdee626454689f7a0e89b23fd340401804cd6a2cc1ce783441f9bd6eaa6d8ab9327a9a31eeec1f5a16097a0387a80756aff082e9cabaead97c745545cefe987b33f61049dba619df248fd2d98339592e7004b289d2fc982362b51e44b4f5289a961e01ccf93355b9c5c08c834c98886cfc62a09535b54130d376d4d68cc7ff6ba4d857667971ab35a853803c95da8cd506343954f84966c9882da9bb87ed3b8c6c159ff9dd197be19064f260cda9a1d0a520371b579b68acf7238319348549c5aa849b984cb3389d376e3f74663f9edc76e86e4ba141d8908b33fc5694dfb50dae53fb78d50c3f48dfb28792c9e8ab740ef591fec46e1abe6e50fde63cc102d68eb249c93a409d63d5be16214a15d5952bd74d07f46477067179b94c5f7a7ded66941c0427855906f7fa54b21c0c22ac8d316f92e21fbbb63671b55386917cb323646dff8e493e5751f3df610021073acce53c7d49680470f2eca3a4a5a427e2680222986174d2d540146f37b4eb2434a6b32997153fb25475285507e71dbb03a8120c86ab070545708438c8c3b247dae6ebcc0a3ebcd22921720922daf56567200dbe6396c27ff6a9d13a96988bbf6f9bc018a9d6cac31ba7689fd4af1af8ac75ffb1f26997aa35927019713e1576409700d467c5d0f3515c05';

    let superBox: SuperBox;
    it('read a JUMBF box', function () {
        const buffer = BinaryHelper.fromHexString(serializedString);

        // fetch schema from the box class
        const schema = SuperBox.schema;

        // read the box from the buffer
        const reader = new bin.BufferReader(buffer, { endianness: 'big' });
        const box = schema.read(reader);
        assert.equal(reader.currentByteOffset, buffer.length, 'consumed number of bytes differs');

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.signature');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.signature);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);

        // verify contained COSE signature
        assert.equal(box.contentBoxes[0].tag, 18, 'expected CBOR COSE_Sign1 tag');
        const coseSignature = box.contentBoxes[0].content;
        assert.ok(coseSignature);
        assert.ok(Array.isArray(coseSignature));
        assert.equal(coseSignature.length, 4);
        assert.ok(coseSignature[0] instanceof Uint8Array);
        assert.ok(coseSignature[1] instanceof Object);
        assert.equal(coseSignature[2], null);
        assert.ok(coseSignature[3] instanceof Uint8Array);

        superBox = box;
    });

    let signature: Signature;
    it('construct a signature from the JUMBF box', function () {
        if (!superBox) this.skip();

        const s = Signature.read(superBox);

        assert.equal(s.sourceBox, superBox);

        assert.equal(s.label, 'c2pa.signature');
        assert.ok(s.signatureData);

        signature = s;
    });

    it('construct a JUMBF box from the signature', function () {
        if (!signature) this.skip();

        const box = signature.generateJUMBFBox();

        // check that the source box was regenerated
        assert.notEqual(box, superBox);
        assert.equal(box, signature.sourceBox);

        // verify box content
        assert.ok(box.descriptionBox);
        assert.equal(box.descriptionBox.label, 'c2pa.signature');
        assert.deepEqual(box.descriptionBox.uuid, raw.UUIDs.signature);
        assert.equal(box.contentBoxes.length, 1);
        assert.ok(box.contentBoxes[0] instanceof CBORBox);
        assert.equal(box.contentBoxes[0].tag, 18, 'expected CBOR COSE_Sign1 tag');
        assert.ok(box.contentBoxes[0].content);
        assert.ok(typeof box.contentBoxes[0].content === 'object');
    });
});
