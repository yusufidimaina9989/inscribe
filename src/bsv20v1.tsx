import { useEffect, useState } from "react";
import { Container, Box, Typography, Button, TextField, Backdrop, CircularProgress, Chip } from '@mui/material';
import { Addr, PandaSigner, toByteString, bsv, UTXO } from "scrypt-ts";
import { Navigate } from "react-router-dom";
import { BSV20V1P2PKH } from "scrypt-ord";
import axios from 'axios';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';

const serviceFeePerRepeat = 50;

function BSV20v1(props) {

    const { _ordiAddress, _signer, _network } = props

    const connected = () => {
        return _ordiAddress !== undefined
    }

    const MINT_TICK_TEXT_INVALID = 'Invalid! Tick not found.'
    const MINT_TICK_TEXT_MINT_OUT = 'Tick was already mint out!'
    const [_mintTickText, setMintTickText] = useState<string | undefined>(undefined)
    const validMintTick = () => _mintTickText !== undefined && _mintTickText !== MINT_TICK_TEXT_MINT_OUT && _mintTickText !== MINT_TICK_TEXT_INVALID

    const setMintTickInfo = (tickText: string | undefined, max: bigint | undefined, lim: bigint | undefined, dec: bigint | undefined) => {
        setMintTickText(tickText)
        setTickInfo(max, lim, dec)
    }

    const [_mintTick, setMintTick] = useState<string | undefined>(undefined)
    
    const [_isLoading, setLoading] = useState<boolean>(false)
    const [_price, setPrice] = useState<number>(0);
    const [_cost, setCost] = useState<number>(0)
    const [_feePerKb, setFeePerKb] = useState<number>(1);
    const [_utxos, setUTXOs] = useState<UTXO[]>([]);
    const mintTickOnChange = (e) => setMintTick(e.target.value)
    const mintTickOnBlur = async () => {
        try {
            if (_mintTick) {
                const info = await axios
                    .get(`https://v3.ordinals.gorillapool.io/api/bsv20/tick/${_mintTick}`)
                    .then(r => r.data)
                console.log(info)
                const tickText = info.available === '0' ? MINT_TICK_TEXT_MINT_OUT : `Tick: ${info.tick}`
                setMintTickInfo(tickText, BigInt(info.max), BigInt(info.lim), BigInt(info.dec))
            } else {
                setMintTickInfo(undefined, undefined, undefined, undefined)
            }
        } catch {
            setMintTickInfo(MINT_TICK_TEXT_INVALID, undefined, undefined, undefined)
        }
    }

    const [_max, setMax] = useState<bigint | undefined>(undefined)
    const [_lim, setLim] = useState<bigint | undefined>(undefined)
    const [_dec, setDec] = useState<bigint | undefined>(undefined)

    const setTickInfo = (max: bigint | undefined, lim: bigint | undefined, dec: bigint | undefined) => {
        setMax(max)
        setLim(lim)
        setDec(dec)
    }

    const [_repeat, setRepeat] = useState<bigint | undefined >(1n)
    const repeatOnChange = (e) => {
        if (/^\d+$/.test(e.target.value)) {
            setRepeat(BigInt(e.target.value))
            setCost(calcCost(_utxos, Number(e.target.value)));
        } else {
            setRepeat(undefined)
        }
    }

    function buildTx(utxos: UTXO[], changeAddress: bsv.Address, feePerKb: number, repeat: number) {
        const fundAddress = '1PakfkHtdJa62F1p5n68aN417Ah5VCB5i4'

        const fee = serviceFeePerRepeat * repeat
        const tx = new bsv.Transaction()
            .from(utxos)
            .addOutput(new bsv.Transaction.Output({
                script: bsv.Script.fromAddress(fundAddress),
                satoshis: fee,
            }))

        for (let i = 0; i < repeat; i++) {
            tx.addOutput(new bsv.Transaction.Output({
                satoshis: 2,
                script: bsv.Script.buildPublicKeyHashOut("13J4uQehfdvgrbs3zR4JQ46hQgm9zr8yGv")
            }))
        }

        tx.change(changeAddress)
        tx.feePerKb(feePerKb)

        return tx;
    }

    function  calcCost(utxos: UTXO[], repeat: number){
        const dummyChangeAddress = bsv.Address.fromString('13J4uQehfdvgrbs3zR4JQ46hQgm9zr8yGv');
        const tx = buildTx(utxos, dummyChangeAddress, _feePerKb, repeat);
        return tx.inputAmount - tx.getChangeAmount() + Number(repeat!);
    }

    const validFireInput = () => validMintTick() && _repeat !== undefined && _repeat > 0n && _repeat <= 10000n!

    const fire = async () => {

        try {
            setLoading(true)
            const signer = _signer as PandaSigner
            const address = await signer.getDefaultAddress();
            const tx = buildTx(_utxos, address, _feePerKb, Number(_repeat!));
            const signedTx = await signer.signTransaction(tx)
            const response = await axios
                .post(`https://witnessonchain.com/bsv20v1/batch_mint`, {
                    raw: signedTx.toString(),
                    tick: _mintTick,
                    lim: _lim!.toString(),
                    repeat: _repeat!.toString(),
                    addr: _ordiAddress.toString()
                })
                .then(r => r.data)
            setResult(response?.code === 0 ? `Order Tx: ${tx.id}` : `Error ${response.code}: ${response.message}`)
        } catch (e: any) {
            console.error('error', e)
            setResult(`${e.message ?? e}`)
        } finally {
            setLoading(false)
        }

        if (window.gtag) {
            const fee = serviceFeePerRepeat * Number(_repeat!)
            window.gtag('event', 'inscribe-bsv20v1-batch-mint', {
                tick: _mintTick,
                amt: _lim!.toString(),
                repeat: _repeat!.toString(),
                fee: fee!.toString()
            });
        }
    }

    const [_result, setResult] = useState<string | undefined>(undefined)

    const [_mintOrDeploy, setMintOrDeploy] = useState('mint')
    const mintOrDeployOnChange = (e) => {
        const value = e.target.value as string
        setMintOrDeploy(value)
        if (value === 'deploy') {
            setDeployTickInfo(undefined, undefined, 0n, 0n)
        } else {
            setMintTickInfo(undefined, undefined, undefined, undefined)
        }
        setResult(undefined)
    }

    const DEPLOY_TICK_TEXT_INVALID = 'Invalid! Tick should be 4 letters.'
    const DEPLOY_TICK_TEXT_EXISTED = 'Tick existed!'
    const [_deployTickText, setDeployTickText] = useState<string | undefined>(undefined)
    const validDeployTick = () => _deployTickText !== undefined && _deployTickText !== DEPLOY_TICK_TEXT_INVALID && _deployTickText !== DEPLOY_TICK_TEXT_EXISTED

    const setDeployTickInfo = (tickText: string | undefined, max: bigint | undefined, lim: bigint | undefined, dec: bigint | undefined) => {
        setDeployTickText(tickText)
        setTickInfo(max, lim, dec)
    }

    const [_deployTick, setDeployTick] = useState<string | undefined>(undefined)
    const deployTickOnChange = e => setDeployTick(e.target.value)
    const deployTickOnBlur = async () => {
        try {
            if (!_deployTick) {
                setDeployTickText(undefined)
            } else if (_deployTick.length !== 4) {
                setDeployTickText(DEPLOY_TICK_TEXT_INVALID)
            } else {
                const info = await axios
                    .get(`https://v3.ordinals.gorillapool.io/api/bsv20/tick/${_deployTick}`)
                    .then(r => r.data)
                console.log(info)
                setDeployTickText(DEPLOY_TICK_TEXT_EXISTED)
            }
        } catch {
            setDeployTickText(`Tick: ${_deployTick?.toUpperCase()}`)
        }
    }

    const maxOnChange = e => setMax(/^\d+$/.test(e.target.value) ? BigInt(e.target.value) : undefined)
    const limOnChange = e => setLim(/^\d+$/.test(e.target.value) ? BigInt(e.target.value) : undefined)
    const decOnChange = e => setDec(/^\d+$/.test(e.target.value) ? BigInt(e.target.value) : undefined)

    const validDeployInput = () => validDeployTick() && _max !== undefined && _lim !== undefined && _dec !== undefined && _max > 0 && _dec <= 18 && _lim <= _max

    const deploy = async () => {
        try {
            const signer = _signer as PandaSigner
            const instance = new BSV20V1P2PKH(toByteString(_deployTick!, true), _max!, _lim!, _dec!, Addr(_ordiAddress!.toByteString()))
            await instance.connect(signer)

            const deployTx = await instance.deployToken()
            setResult(`Deploy Tx: ${deployTx.id}`)

            setDeployTickInfo(undefined, undefined, 0n, 0n)
        } catch (e: any) {
            console.error('error', e)
            setResult(`${e.message ?? e}`)
        }

        if (window.gtag) {
            window.gtag('event', 'inscribe-bsv20v1-deploy');
        }
    }

    useEffect( () => {
        const signer = _signer as PandaSigner;

        signer.getDefaultAddress()
        .then(address => signer.listUnspent(address))
        .then(us => {
            setUTXOs(us || []);

            setCost(calcCost(us, Number(_repeat || 1)));
        })
        signer.provider!.getFeePerKb().then(fpkb => {
            setFeePerKb(fpkb);
        })
    }, [])


    useEffect( () => {
        fetch("https://api.whatsonchain.com/v1/bsv/main/exchangerate")
        .then(res => res.json())
        .then(data => {
            setPrice(data?.rate || 0);
        })
    }, [])


    return (
        <Container maxWidth="md">
            {!connected() && (<Navigate to="/" />)}
            <Box sx={{ my: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom align="center">
                    Inscribe BSV-20 v1
                </Typography>
            </Box>
            <Box sx={{ my: 2 }}>
                <FormControl>
                    <FormLabel id="radio-buttons-mint-deploy-label" sx={{ mb: 1 }}>Mint or Deploy</FormLabel>
                    <RadioGroup aria-labelledby="radio-buttons-mint-deploy-label" defaultValue="mint" name="radio-buttons-mint-deploy" onChange={mintOrDeployOnChange}>
                        <FormControlLabel value="mint" control={<Radio />} label="Mint Existing Tick" />
                        <FormControlLabel value="deploy" control={<Radio />} label="Deploy New Tick" />
                    </RadioGroup>
                </FormControl>
            </Box>
            {_mintOrDeploy === 'mint' && (
                <Box sx={{ my: 3 }}>
                    <TextField label="Tick" variant="outlined" fullWidth required onChange={mintTickOnChange} onBlur={mintTickOnBlur} />
                    {_mintTickText !== undefined && (<Box sx={{ mt: 2, ml: 2 }}><Typography variant="body1">{_mintTickText}</Typography></Box>)}
                    {_mintTickText !== undefined && _mintTickText !== MINT_TICK_TEXT_INVALID && _mintTickText !== MINT_TICK_TEXT_MINT_OUT && (
                        <Box>
                            <Typography variant="body1" sx={{ mt: 2, ml: 2 }}>Max Supply: {_max?.toString()}</Typography>
                            <Typography variant="body1" sx={{ mt: 2, ml: 2 }}>Limit Per Mint: {_lim?.toString()}</Typography>
                            <Typography variant="body1" sx={{ mt: 2, ml: 2, mb: 1 }}>Decimal Precision: {_dec?.toString()}</Typography>
                        </Box>
                    )}
    
                    <Box sx={{ mt: 2 }}>
                        <TextField label="Repeat (Max: 10000, Fee: 50 sats/mint)" defaultValue={1} variant="outlined" required fullWidth onChange={repeatOnChange} disabled={!validMintTick()} />
                        
                        <Box sx={{ mt: 2,display: 'flex', flexDirection: "row" }}>

                            <Button variant="contained" color="primary" sx={{ mt: 2 }} disabled={!connected() || !validFireInput()} onClick={fire}>
                                Fire!
                            </Button>
                        {
                                _cost > 0 && validFireInput() ?
                                <Typography color="primary" sx={{mt: 3, ml: 3}}>{_price > 0 ? `Total Cost: ${_cost} sats, $${(_price*_cost/100000000).toFixed(5)}USD ` : `Total Cost: ${_cost} sats`}</Typography>
                                : 
                                <></>
                            }
                        </Box>

                    </Box>
                </Box>
            )}
            {_mintOrDeploy === 'deploy' && (
                <Box sx={{ my: 3 }}>
                    <TextField label="Tick" variant="outlined" fullWidth required onChange={deployTickOnChange} onBlur={deployTickOnBlur} />
                    {_deployTickText !== undefined && (<Box sx={{ mt: 2, ml: 2 }}><Typography variant="body1">{_deployTickText}</Typography></Box>)}
                    {_deployTickText !== undefined && _deployTickText !== DEPLOY_TICK_TEXT_INVALID && _deployTickText !== DEPLOY_TICK_TEXT_EXISTED && (
                        <Box>
                            <TextField label="Max Supply" sx={{ mt: 2 }} required variant="outlined" fullWidth onChange={maxOnChange} />
                            <TextField label="Limit Per Mint" sx={{ mt: 2 }} required variant="outlined" fullWidth onChange={limOnChange} defaultValue={'0'} />
                            <TextField label="Decimal Precision" sx={{ mt: 2 }} required variant="outlined" fullWidth onChange={decOnChange} defaultValue={'0'} />
                        </Box>
                    )}
                    <Button variant="contained" color="primary" sx={{ mt: 2 }} disabled={!connected() || !validDeployInput()} onClick={deploy}>
                        Deploy It!
                    </Button>
                </Box>
            )}
            {_result && (<Box sx={{ mt: 3 }}><Typography variant="body1">{_result}</Typography></Box>)}

            <Backdrop
                sx={{ color: '#fff', zIndex: 1000000 }}
                open={_isLoading}
            >
                <CircularProgress color="inherit" />
            </Backdrop>
        </Container>
    )
}

export default BSV20v1;
